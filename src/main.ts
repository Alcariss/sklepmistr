import '@alcariss/pwa-kit/styles.css';
import './styles.css';
import { registerSW } from 'virtual:pwa-register';
import {
  ApiError,
  AUTH_ERROR_CODES,
  createApiClient,
  createAuth,
  createCache,
  createResource,
  createStore,
  formatAge,
  isDebugEnabled,
  readApiConfig,
  renderDiagnostics,
  renderLoginScreen,
  requiredElement,
  setupUpdatePrompt,
  toIsoDate,
  type Diagnostics
} from '@alcariss/pwa-kit';
import { toHousehold, toHouseholdParams, toItem, toItemParams, type HouseholdInput, type ItemInput } from './model';
import { estimateFoodKcal } from './estimate';
import { lookupProduct, type ProductDraft } from './products';
import { scanBarcode } from './scanner';
import { decimalFieldValue, parseDecimal } from './text';
import {
  DEFAULT_HOUSEHOLD,
  expiryStatus,
  formatNumber,
  suggestExpiry,
  type Category,
  type Household,
  type Item
} from './supplies';
import {
  TABS,
  renderBarcodeMatch,
  renderHousehold,
  renderItemForm,
  renderNav,
  renderOverview,
  renderPrintSheet,
  renderShopping,
  renderStockList,
  renderStockShell,
  type ItemDraft,
  type Tab
} from './views';

const APP_NAME = 'Sklepmistr';
const LOCALE = 'cs';

const AUTH_MESSAGES: Record<string, string> = {
  cancelled: 'Přihlášení bylo zrušeno.',
  not_allowed: 'Tento účet nemá do Sklepmistra přístup.',
  provider_error: 'Přihlášení se nepovedlo. Zkuste to znovu.',
  invalid_session: 'Přihlášení se nepovedlo. Zkuste to znovu.'
};

const config = readApiConfig(import.meta.env);
const auth = createAuth({ apiUrl: config.primaryUrl });
const client = createApiClient(config, { getSessionToken: () => auth.current()?.token ?? null });
const itemStore = createStore<Item, ItemInput>({
  resource: createResource(client, { table: 'items', mapRow: toItem, toParams: toItemParams }),
  cache: createCache<Item>('sklepmistr:v1:items')
});
const householdStore = createStore<Household, HouseholdInput>({
  resource: createResource(client, { table: 'household', mapRow: toHousehold, toParams: toHouseholdParams }),
  cache: createCache<Household>('sklepmistr:v1:household')
});
const root = requiredElement('#app');
const signInRequired = config.authProviders.length > 0;

type State = {
  items: Item[];
  household: Household;
  tab: Tab;
  search: string;
  category: Category | '';
};

const state: State = {
  items: [],
  household: DEFAULT_HOUSEHOLD,
  tab: tabFromHash(),
  search: '',
  category: ''
};

setupUpdatePrompt(registerSW, { message: 'Je k dispozici nová verze.', buttonLabel: 'Aktualizovat' });

function tabFromHash(): Tab {
  const id = location.hash.replace(/^#/, '');
  return TABS.find((tab) => tab.id === id)?.id ?? 'prehled';
}

function today(): string {
  return toIsoDate();
}

function showLogin(message: string | null = null): void {
  itemStore.clear();
  householdStore.clear();
  renderLoginScreen(root, {
    title: `🕯️ ${APP_NAME}`,
    providers: config.authProviders,
    message,
    labels: { google: 'Přihlásit přes Google', github: 'Přihlásit přes GitHub' },
    onSelect: (provider) => auth.login(provider)
  });
}

function showShell(): void {
  root.innerHTML = `
    <header class="topbar">
      <h1>🕯️ ${APP_NAME}</h1>
      <span id="sync" class="sync" role="status"></span>
    </header>
    <main id="view" class="container"></main>
    <section id="debug" class="container"></section>
    <nav id="nav" class="tabs" aria-label="Sekce"></nav>
    <dialog id="item-dialog" aria-label="Zásoba"></dialog>
    <dialog id="scan-dialog" aria-label="Čárový kód"></dialog>
    <div id="toast" class="toast" role="status" hidden></div>
    <div id="print-sheet" class="print-only"></div>
  `;

  requiredElement('#nav').addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-tab]');
    if (button?.dataset.tab) {
      location.hash = button.dataset.tab;
    }
  });
  window.addEventListener('hashchange', () => {
    state.tab = tabFromHash();
    render();
  });
  root.addEventListener('click', (event) => void onAction(event));
}

function render(): void {
  const view = requiredElement('#view');
  const date = today();
  requiredElement('#nav').innerHTML = renderNav(state.tab);

  switch (state.tab) {
    case 'prehled':
      view.innerHTML = renderOverview(state.items, state.household, date);
      break;
    case 'zasoby':
      view.innerHTML = renderStockShell();
      wireStockFilters();
      renderStock();
      break;
    case 'nakup':
      view.innerHTML = renderShopping(state.items, state.household, date);
      break;
    case 'rodina':
      view.innerHTML = renderHousehold(state.household, __APP_VERSION__, auth.current()?.email ?? null);
      wireHouseholdForm();
      break;
  }
  updateBadge();
}

function renderStock(): void {
  requiredElement('#stock-list').innerHTML = renderStockList(state.items, today(), state.search, state.category);
}

function wireStockFilters(): void {
  const search = requiredElement<HTMLInputElement>('#stock-search');
  const category = requiredElement<HTMLSelectElement>('#stock-category');
  search.value = state.search;
  category.value = state.category;
  search.addEventListener('input', () => {
    state.search = search.value;
    renderStock();
  });
  category.addEventListener('change', () => {
    state.category = category.value as Category | '';
    renderStock();
  });
}

function toast(message: string, tone: 'info' | 'error' = 'info'): void {
  const node = requiredElement('#toast');
  node.textContent = message;
  node.dataset.tone = tone;
  node.hidden = false;
  window.clearTimeout(Number(node.dataset.timer));
  node.dataset.timer = String(window.setTimeout(() => {
    node.hidden = true;
  }, tone === 'error' ? 6000 : 2500));
}

function setSync(text: string): void {
  requiredElement('#sync').textContent = text;
}

/** Number of expired or soon-expiring items on the installed app's icon. */
function updateBadge(): void {
  const date = today();
  const count = state.items.filter((item) =>
    item.quantity > 0 && ['expired', 'soon'].includes(expiryStatus(item.expiry, date))).length;
  const nav = navigator as Navigator & {
    setAppBadge?: (count?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  const update = count > 0 ? nav.setAppBadge?.(count) : nav.clearAppBadge?.();
  // Browsers without an installed app or permission reject; the badge is a nicety.
  update?.catch(() => undefined);
}

function handleError(error: unknown, message: string): void {
  if (error instanceof ApiError && AUTH_ERROR_CODES.includes(error.code)) {
    auth.logout();
    showLogin(error.code === 'FORBIDDEN' ? AUTH_MESSAGES.not_allowed : 'Přihlášení vypršelo. Přihlaste se znovu.');
    return;
  }
  console.error(error);
  const offline = error instanceof ApiError && ['NETWORK_ERROR', 'TIMEOUT'].includes(error.code);
  const detail = offline ? 'Jste offline – změny teď uložit nejde.' : error instanceof Error ? error.message : '';
  toast(`${message} ${detail}`.trim(), 'error');
}

function findItem(id: string | undefined): Item | null {
  return state.items.find((item) => item.id === id) ?? null;
}

async function onAction(event: Event): Promise<void> {
  const button = (event.target as Element).closest<HTMLButtonElement>('[data-action]');
  if (!button) {
    return;
  }
  const item = findItem(button.dataset.id);

  switch (button.dataset.action) {
    case 'add-item':
      openItemDialog(null);
      break;
    case 'scan':
      await scanToStock();
      break;
    case 'scan-into-form':
      await scanIntoForm();
      break;
    case 'edit-item':
      if (item) {
        openItemDialog(item);
      }
      break;
    case 'use-one':
      if (item && item.quantity > 0) {
        button.disabled = true;
        await saveItem(
          () => itemStore.update(item.id, { ...item, quantity: Math.max(0, item.quantity - 1) }),
          `${item.name}: −1`
        );
      }
      break;
    case 'delete-item':
      if (item && confirm(`Smazat „${item.name}“?`)) {
        closeDialog();
        await saveItem(() => itemStore.remove(item.id), 'Smazáno.');
      }
      break;
    case 'close-dialog':
      closeDialog();
      break;
    case 'print':
      requiredElement('#print-sheet').innerHTML = renderPrintSheet(state.items, state.household, today());
      window.print();
      break;
    case 'logout':
      auth.logout();
      showLogin();
      break;
  }
}

async function saveItem(save: () => Promise<{ items: Item[] }>, done: string): Promise<boolean> {
  try {
    state.items = (await save()).items;
    render();
    toast(done);
    return true;
  } catch (error) {
    handleError(error, 'Uložení se nepovedlo.');
    if (auth.current() !== null || !signInRequired) {
      render();
    }
    return false;
  }
}

function closeDialog(): void {
  requiredElement<HTMLDialogElement>('#item-dialog').close();
}

function knownLocations(): string[] {
  return [...new Set(state.items.map((item) => item.location).filter((location) => location !== ''))]
    .sort((left, right) => left.localeCompare(right, 'cs'));
}

function readNumber(form: HTMLFormElement, name: string): number | null {
  const field = form.elements.namedItem(name) as HTMLInputElement | null;
  return field ? parseDecimal(field.value) : null;
}

/** Visible decimal fields whose text is not a number, e.g. "1,5,2". */
function invalidDecimalFields(form: HTMLFormElement): HTMLInputElement[] {
  return [...form.querySelectorAll<HTMLInputElement>('input[inputmode="decimal"]')]
    .filter((field) => field.name !== '' && field.closest('[hidden]') === null)
    .filter((field) => field.value.trim() !== '' && parseDecimal(field.value) === null);
}

function readText(form: HTMLFormElement, name: string): string {
  return (form.elements.namedItem(name) as HTMLInputElement | null)?.value ?? '';
}

function openItemDialog(item: Item | null, draft: ItemDraft = {}): void {
  const dialog = requiredElement<HTMLDialogElement>('#item-dialog');
  dialog.innerHTML = renderItemForm(item, knownLocations(), draft);
  const form = requiredElement<HTMLFormElement>('#item-form', dialog);
  const categorySelect = requiredElement<HTMLSelectElement>('#item-category', dialog);
  const expiry = form.elements.namedItem('expiry') as HTMLInputElement;
  const hint = requiredElement('#expiry-hint', dialog);
  let suggested = '';

  const applyCategory = (): void => {
    const category = categorySelect.value as Category;
    for (const section of dialog.querySelectorAll<HTMLElement>('[data-show]')) {
      const show = section.dataset.show;
      section.hidden = show === 'daily' ? category === 'water' || category === 'food' : show !== category;
    }
    // Offer a typical shelf life, but never overwrite a date someone typed.
    if (item === null && (expiry.value === '' || expiry.value === suggested)) {
      suggested = suggestExpiry(category, today());
      expiry.value = suggested;
    }
    hint.textContent = expiry.value !== '' && expiry.value === suggested ? 'odhad – zkontrolujte obal' : '';
  };
  categorySelect.addEventListener('change', applyCategory);
  expiry.addEventListener('input', applyCategory);
  applyCategory();

  const kcalPer100 = requiredElement<HTMLInputElement>('#kcal-per-100', dialog);
  const grams = requiredElement<HTMLInputElement>('#grams', dialog);
  const foodSize = form.elements.namedItem('packageSize-food') as HTMLInputElement;
  const nameField = form.elements.namedItem('name') as HTMLInputElement;
  const estimateHint = requiredElement('#kcal-estimate', dialog);
  // Food without its own kcal is counted from the name; say so, and with what.
  const showEstimate = (): void => {
    const estimate = foodSize.value.trim() === '' ? estimateFoodKcal(nameField.value) : null;
    estimateHint.hidden = estimate === null;
    estimateHint.textContent = estimate === null
      ? ''
      : `Nevyplníte-li, počítá se odhadem ≈ ${formatNumber(estimate.kcal)} kcal (${estimate.label}, ${formatNumber(estimate.grams)} g).`;
  };
  const computeKcal = (): void => {
    const per100 = parseDecimal(kcalPer100.value) ?? 0;
    const weight = parseDecimal(grams.value) ?? 0;
    if (per100 > 0 && weight > 0) {
      foodSize.value = String(Math.round((per100 * weight) / 100));
      showEstimate();
    }
  };
  kcalPer100.addEventListener('input', computeKcal);
  grams.addEventListener('input', computeKcal);
  nameField.addEventListener('input', showEstimate);
  foodSize.addEventListener('input', showEstimate);
  showEstimate();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const error = requiredElement('#item-error', dialog);
    const invalid = invalidDecimalFields(form);
    if (invalid.length > 0 || readNumber(form, 'quantity') === null) {
      error.textContent = 'Čísla pište jako 1,5 nebo 2. Počet musí být vyplněný.';
      error.hidden = false;
      (invalid[0] ?? (form.elements.namedItem('quantity') as HTMLInputElement)).focus();
      return;
    }
    error.hidden = true;
    const category = categorySelect.value as Category;
    const measuredByAmount = category === 'water' || category === 'food';
    const input: ItemInput = {
      name: readText(form, 'name'),
      category,
      location: readText(form, 'location'),
      quantity: readNumber(form, 'quantity') ?? 0,
      packageSize: measuredByAmount ? readNumber(form, `packageSize-${category}`) : null,
      dailyUse: measuredByAmount ? null : readNumber(form, 'dailyUse'),
      expiry: expiry.value,
      note: readText(form, 'note'),
      barcode: readText(form, 'barcode')
    };
    const submit = requiredElement<HTMLButtonElement>('#item-submit', dialog);
    submit.disabled = true;
    const saved = await saveItem(
      () => (item ? itemStore.update(item.id, input) : itemStore.create(input)),
      item ? 'Uloženo.' : 'Přidáno.'
    );
    submit.disabled = false;
    if (saved) {
      closeDialog();
    }
  });

  dialog.showModal();
}

function draftFromProduct(product: ProductDraft): ItemDraft {
  return { barcode: product.barcode, name: product.name, category: product.category, packageSize: product.packageSize };
}

async function findProduct(code: string): Promise<ProductDraft | null> {
  toast('Hledám produkt…');
  const product = await lookupProduct(code);
  toast(product?.name ? `Nalezeno: ${product.name}` : 'Produkt v databázi není – vyplňte ho ručně.');
  return product;
}

/** Scan from the stock list: known code -> +1 or new batch; new code -> pre-filled form. */
async function scanToStock(): Promise<void> {
  const scanDialog = requiredElement<HTMLDialogElement>('#scan-dialog');
  const code = await scanBarcode(scanDialog);
  if (code === null) {
    return;
  }

  const matches = state.items.filter((item) => item.barcode === code);
  if (matches.length === 0) {
    const product = await findProduct(code);
    openItemDialog(null, product ? draftFromProduct(product) : { barcode: code });
    return;
  }

  scanDialog.innerHTML = renderBarcodeMatch(code, matches, today());
  scanDialog.showModal();
  scanDialog.onclick = async (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-match]');
    const item = findItem(button?.dataset.id);
    switch (button?.dataset.match) {
      case 'plus-one':
        if (item) {
          scanDialog.close();
          await saveItem(() => itemStore.update(item.id, { ...item, quantity: item.quantity + 1 }), `${item.name}: +1`);
        }
        break;
      case 'new-batch':
        if (item) {
          scanDialog.close();
          const { id: _id, expiry: _expiry, quantity: _quantity, ...copy } = item;
          openItemDialog(null, copy);
        }
        break;
      case 'close':
        scanDialog.close();
        break;
    }
  };
  scanDialog.addEventListener('close', () => {
    scanDialog.onclick = null;
  }, { once: true });
}

/** Scan from inside the item form: fills what the user has not typed yet. */
async function scanIntoForm(): Promise<void> {
  const dialog = requiredElement<HTMLDialogElement>('#item-dialog');
  const form = requiredElement<HTMLFormElement>('#item-form', dialog);
  const code = await scanBarcode(requiredElement<HTMLDialogElement>('#scan-dialog'));
  if (code === null || !dialog.open) {
    return;
  }

  const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
  (field('barcode') as HTMLInputElement).value = code;
  const line = requiredElement('#barcode-line', dialog);
  line.textContent = `Čárový kód ${code}`;
  line.hidden = false;

  const product = await findProduct(code);
  if (product === null) {
    return;
  }
  const name = field('name') as HTMLInputElement;
  if (name.value.trim() === '' && product.name) {
    name.value = product.name;
  }
  const category = field('category') as HTMLSelectElement;
  category.value = product.category;
  category.dispatchEvent(new Event('change'));
  const size = field(`packageSize-${product.category}`) as HTMLInputElement | null;
  if (size && size.value === '' && product.packageSize !== null) {
    size.value = decimalFieldValue(product.packageSize);
    size.dispatchEvent(new Event('input'));
  }
}

function wireHouseholdForm(): void {
  const form = requiredElement<HTMLFormElement>('#household-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input: HouseholdInput = {
      adults: readNumber(form, 'adults') ?? 0,
      children: readNumber(form, 'children') ?? 0,
      toddlers: readNumber(form, 'toddlers') ?? 0,
      targetDays: readNumber(form, 'targetDays') ?? DEFAULT_HOUSEHOLD.targetDays
    };
    const submit = requiredElement<HTMLButtonElement>('#household-submit');
    submit.disabled = true;
    try {
      const { id } = state.household;
      const result = id === null ? await householdStore.create(input) : await householdStore.update(id, input);
      state.household = result.items[0] ?? DEFAULT_HOUSEHOLD;
      render();
      toast('Uloženo.');
    } catch (error) {
      handleError(error, 'Uložení se nepovedlo.');
      submit.disabled = false;
    }
  });
}

function showDiagnostics(diagnostics: Diagnostics): void {
  if (isDebugEnabled()) {
    renderDiagnostics(requiredElement('#debug'), diagnostics, { Version: __APP_VERSION__ });
  }
}

async function refresh(): Promise<void> {
  try {
    const [items, household] = await Promise.all([itemStore.refresh(), householdStore.refresh()]);
    state.items = items.items;
    state.household = household.items[0] ?? DEFAULT_HOUSEHOLD;
    render();
    setSync(items.diagnostics.source === 'cache'
      ? `Offline · data ${formatAge((items.diagnostics.cacheAgeSeconds ?? 0) * 1000, LOCALE)}`
      : '');
    showDiagnostics(items.diagnostics);
  } catch (error) {
    setSync('');
    handleError(error, 'Zásoby se nepodařilo načíst.');
  }
}

async function start(): Promise<void> {
  const outcome = auth.completeLogin();
  if (outcome.status === 'failed') {
    showLogin(AUTH_MESSAGES[outcome.reason] ?? AUTH_MESSAGES.provider_error ?? null);
    return;
  }
  if (signInRequired && auth.current() === null) {
    showLogin();
    return;
  }

  showShell();
  const cachedItems = itemStore.loadCached();
  if (cachedItems) {
    state.items = cachedItems.items;
    state.household = householdStore.loadCached()?.items[0] ?? DEFAULT_HOUSEHOLD;
    setSync('Aktualizuji…');
  } else {
    setSync('Načítám…');
  }
  render();
  await refresh();
}

void start();
