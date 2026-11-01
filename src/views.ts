import { escapeHtml } from '@alcariss/pwa-kit';
import {
  CATEGORIES,
  CATEGORY_ICONS,
  CATEGORY_LABELS,
  DAILY_NEEDS,
  ESSENTIALS,
  MINIMUM_DAYS,
  SOON_DAYS,
  coverage,
  dailyNeeds,
  expiryStatus,
  formatDate,
  formatDays,
  formatNumber,
  hasEssential,
  householdSize,
  shoppingList,
  type Category,
  type Coverage,
  type ExpiryStatus,
  type Household,
  type Item
} from './supplies';

export const TABS = [
  { id: 'prehled', label: 'Přehled', icon: '📊' },
  { id: 'zasoby', label: 'Zásoby', icon: '🗄️' },
  { id: 'nakup', label: 'Nákup', icon: '🛒' },
  { id: 'rodina', label: 'Rodina', icon: '👪' }
] as const;

export type Tab = (typeof TABS)[number]['id'];

export const NO_LOCATION = 'Nezařazeno';

export function renderNav(active: Tab): string {
  return TABS.map((tab) => `
    <button type="button" class="tab" data-tab="${tab.id}" ${tab.id === active ? 'aria-current="page"' : ''}>
      <span aria-hidden="true">${tab.icon}</span><span>${tab.label}</span>
    </button>`).join('');
}

function tone(days: number | null, target: number): 'unknown' | 'bad' | 'warn' | 'good' {
  if (days === null) {
    return 'unknown';
  }
  if (days < MINIMUM_DAYS) {
    return 'bad';
  }
  return days < target ? 'warn' : 'good';
}

function coverageDetail(cover: Coverage): string {
  if (cover.category === 'water' || cover.category === 'food') {
    const unit = cover.category === 'water' ? 'l' : 'kcal';
    const missing = cover.uncounted.length > 0
      ? ` · ${cover.uncounted.length} bez ${cover.category === 'water' ? 'objemu' : 'kcal'}`
      : '';
    return `${formatNumber(cover.amount ?? 0)} ${unit} · potřeba ${formatNumber(cover.perDay ?? 0)} ${unit}/den${missing}`;
  }
  if (cover.bottleneck) {
    return `Nejdřív dojde: ${escapeHtml(cover.bottleneck.name)}`;
  }
  const count = cover.uncounted.length;
  if (count === 0) {
    return 'Zatím nic';
  }
  const items = count === 1 ? 'položka' : count <= 4 ? 'položky' : 'položek';
  return `${count} ${items} bez denní spotřeby – do výdrže se nepočítá`;
}

function renderCoverageCard(cover: Coverage, target: number): string {
  const share = cover.days === null ? 0 : Math.min(1, cover.days / target);
  return `
    <article class="cover tone-${tone(cover.days, target)}">
      <header>
        <span class="cover-icon" aria-hidden="true">${CATEGORY_ICONS[cover.category]}</span>
        <h3>${CATEGORY_LABELS[cover.category]}</h3>
        <strong class="cover-days">${cover.days === null ? '—' : formatDays(cover.days)}</strong>
      </header>
      <div class="bar" role="img" aria-label="${Math.round(share * 100)} % cíle"><span style="width:${(share * 100).toFixed(0)}%"></span></div>
      <p class="cover-detail">${coverageDetail(cover)}</p>
    </article>`;
}

const STATUS_LABELS: Record<ExpiryStatus, string> = {
  expired: 'prošlé',
  soon: 'brzy projde',
  upcoming: 'do 3 měsíců',
  ok: '',
  none: ''
};

export function renderOverview(items: Item[], household: Household, today: string): string {
  const cover = coverage(items, household, today);
  const expiring = items
    .filter((item) => item.quantity > 0 && ['expired', 'soon'].includes(expiryStatus(item.expiry, today)))
    .sort((left, right) => left.expiry.localeCompare(right.expiry));
  const upcoming = items.filter((item) => item.quantity > 0 && expiryStatus(item.expiry, today) === 'upcoming').length;

  return `
    <section>
      <p class="lead">Jak dlouho vydržíte bez proudu a obchodů, když je vás ${householdSize(household)}.
        Cíl ${formatDays(household.targetDays)}, minimum ${MINIMUM_DAYS} dny.</p>
      <div class="covers">${CATEGORIES.map((category) => renderCoverageCard(cover[category], household.targetDays)).join('')}</div>
    </section>
    <section>
      <h2>Trvanlivost</h2>
      ${expiring.length === 0
        ? `<p class="muted">Nic neprošlo a nic neprojde do ${SOON_DAYS} dní. 👍</p>`
        : `<ul class="items">${expiring.map((item) => renderItemRow(item, today)).join('')}</ul>`}
      ${upcoming > 0 ? `<p class="muted">Další ${upcoming} ${upcoming === 1 ? 'položka projde' : 'položky projdou'} do 3 měsíců.</p>` : ''}
    </section>`;
}

function quantityText(item: Item): string {
  const count = formatNumber(item.quantity);
  if (item.category === 'water' && item.packageSize) {
    return `${count} × ${formatNumber(item.packageSize)} l`;
  }
  if (item.category === 'food' && item.packageSize) {
    return `${count} ks · ${formatNumber(item.packageSize)} kcal/ks`;
  }
  const use = item.dailyUse ? ` · ${formatNumber(item.dailyUse)}/den` : '';
  return `${count} ks${use}`;
}

export function renderItemRow(item: Item, today: string): string {
  const status = expiryStatus(item.expiry, today);
  const expiry = item.expiry
    ? `<span class="expiry">do ${formatDate(item.expiry)}${STATUS_LABELS[status] ? ` · ${STATUS_LABELS[status]}` : ''}</span>`
    : '';
  const id = escapeHtml(item.id);
  return `
    <li class="item status-${status}${item.quantity <= 0 ? ' empty' : ''}">
      <span class="item-icon" aria-hidden="true">${CATEGORY_ICONS[item.category]}</span>
      <div class="item-body">
        <strong>${escapeHtml(item.name)}</strong>
        <span class="item-meta">${item.quantity <= 0 ? 'došlo' : quantityText(item)}${item.location ? ` · ${escapeHtml(item.location)}` : ''}</span>
        ${expiry}
      </div>
      <div class="item-actions">
        <button type="button" class="ghost" data-action="use-one" data-id="${id}" ${item.quantity <= 0 ? 'disabled' : ''}
          aria-label="Spotřebováno 1 ks: ${escapeHtml(item.name)}">−1</button>
        <button type="button" class="ghost" data-action="edit-item" data-id="${id}"
          aria-label="Upravit ${escapeHtml(item.name)}">✏️</button>
      </div>
    </li>`;
}

export function renderStockShell(): string {
  return `
    <div class="toolbar">
      <input id="stock-search" type="search" placeholder="Hledat…" aria-label="Hledat v zásobách" />
      <select id="stock-category" aria-label="Kategorie">
        <option value="">Vše</option>
        ${CATEGORIES.map((category) => `<option value="${category}">${CATEGORY_ICONS[category]} ${CATEGORY_LABELS[category]}</option>`).join('')}
      </select>
    </div>
    <div class="toolbar">
      <button type="button" data-action="add-item">+ Přidat zásobu</button>
      <button type="button" class="secondary" data-action="print">🖨️ Vytisknout</button>
    </div>
    <div id="stock-list"></div>`;
}

/** Items grouped by where they are stored, filtered by name and category. */
export function renderStockList(items: Item[], today: string, search: string, category: Category | ''): string {
  const needle = search.trim().toLocaleLowerCase('cs');
  const visible = items.filter((item) =>
    (category === '' || item.category === category)
    && (needle === '' || `${item.name} ${item.location} ${item.note}`.toLocaleLowerCase('cs').includes(needle)));

  if (items.length === 0) {
    return '<p class="muted">Zatím tu nic není. Začněte tím, co máte ve sklepě.</p>';
  }
  if (visible.length === 0) {
    return '<p class="muted">Nic neodpovídá hledání.</p>';
  }

  const groups = new Map<string, Item[]>();
  for (const item of visible) {
    const key = item.location || NO_LOCATION;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right, 'cs'))
    .map(([location, group]) => `
      <section class="location">
        <h2>${escapeHtml(location)} <span class="count">${group.length}</span></h2>
        <ul class="items">${group
          .sort((left, right) => CATEGORIES.indexOf(left.category) - CATEGORIES.indexOf(right.category)
            || left.name.localeCompare(right.name, 'cs'))
          .map((item) => renderItemRow(item, today)).join('')}</ul>
      </section>`).join('');
}

export function renderShopping(items: Item[], household: Household, today: string): string {
  const needs = shoppingList(items, household, today);
  return `
    <section>
      <p class="lead">Co chybí, aby zásoby vydržely ${formatDays(household.targetDays)}.</p>
      ${needs.length === 0
        ? '<p class="muted">Máte vše na cílový počet dní. 👍</p>'
        : `<ul class="needs">${needs.map((need) => `
            <li><span aria-hidden="true">${CATEGORY_ICONS[need.category]}</span> ${escapeHtml(need.text)}</li>`).join('')}</ul>`}
      <p class="muted small">Hygiena, léky a energie se počítají jen u položek s vyplněnou denní spotřebou.</p>
    </section>
    <section>
      <h2>Nezapomeňte na</h2>
      <ul class="checklist">${ESSENTIALS.map((essential) => {
        const have = hasEssential(items, essential.keywords);
        return `<li class="${have ? 'have' : ''}"><span aria-hidden="true">${have ? '✅' : '⬜'}</span> ${essential.label}</li>`;
      }).join('')}</ul>
      <p class="muted small">Odškrtne se samo, když má některá zásoba podobný název.</p>
    </section>`;
}

export function renderHousehold(household: Household, version: string, email: string | null): string {
  const needs = dailyNeeds(household);
  const field = (id: keyof Household, label: string, hint: string, min: number) => `
    <label class="field">
      <span>${label}<small>${hint}</small></span>
      <input id="household-${id}" name="${id}" type="number" inputmode="numeric" min="${min}" max="99" step="1"
        value="${household[id]}" required />
    </label>`;

  return `
    <form id="household-form" class="card">
      <h2>Kolik vás je</h2>
      ${field('adults', 'Dospělí', 'od 13 let', 0)}
      ${field('children', 'Děti', '4–12 let', 0)}
      ${field('toddlers', 'Batolata', '1–3 roky', 0)}
      <h2>Cíl</h2>
      ${field('targetDays', 'Zásoby na', 'dní', 1)}
      <button type="submit" id="household-submit">Uložit</button>
    </form>
    <section class="card">
      <h2>Z čeho počítáme</h2>
      <p>Celá rodina denně potřebuje <strong>${formatNumber(needs.waterLiters)} l vody</strong> a <strong>${formatNumber(needs.kcal)} kcal</strong>.</p>
      <table class="assumptions">
        <thead><tr><th></th><th>Voda / den</th><th>Energie / den</th></tr></thead>
        <tbody>
          <tr><td>Dospělý</td><td>${formatNumber(DAILY_NEEDS.adult.waterLiters)} l</td><td>${formatNumber(DAILY_NEEDS.adult.kcal)} kcal</td></tr>
          <tr><td>Dítě 4–12</td><td>${formatNumber(DAILY_NEEDS.child.waterLiters)} l</td><td>${formatNumber(DAILY_NEEDS.child.kcal)} kcal</td></tr>
          <tr><td>Batole 1–3</td><td>${formatNumber(DAILY_NEEDS.toddler.waterLiters)} l</td><td>${formatNumber(DAILY_NEEDS.toddler.kcal)} kcal</td></tr>
        </tbody>
      </table>
      <p class="muted small">Voda na pití a vaření, ne na mytí. Prošlé zásoby se nepočítají.</p>
    </section>
    <section class="card account">
      ${email ? `<p>Přihlášen(a) jako <strong>${escapeHtml(email)}</strong></p>
      <button type="button" class="secondary" data-action="logout">Odhlásit</button>` : ''}
      <p class="muted small">Verze ${escapeHtml(version)}</p>
    </section>`;
}

export function renderItemForm(item: Item | null, locations: string[]): string {
  const value = (key: keyof Item) => escapeHtml(item?.[key] ?? '');
  const selected = item?.category ?? 'food';
  return `
    <form id="item-form" method="dialog">
      <h2>${item ? 'Upravit zásobu' : 'Nová zásoba'}</h2>
      <label class="field"><span>Název</span>
        <input name="name" required maxlength="200" value="${value('name')}" placeholder="např. Fazole v plechovce" autocomplete="off" /></label>
      <label class="field"><span>Kategorie</span>
        <select name="category" id="item-category">
          ${CATEGORIES.map((category) => `<option value="${category}" ${category === selected ? 'selected' : ''}>${CATEGORY_ICONS[category]} ${CATEGORY_LABELS[category]}</option>`).join('')}
        </select></label>
      <label class="field"><span>Kde je</span>
        <input name="location" list="locations" maxlength="100" value="${value('location')}" placeholder="např. Sklep – regál 2" autocomplete="off" />
        <datalist id="locations">${locations.map((location) => `<option value="${escapeHtml(location)}"></option>`).join('')}</datalist></label>
      <label class="field"><span>Počet kusů / balení</span>
        <input name="quantity" type="number" inputmode="decimal" min="0" step="any" required value="${value('quantity') || '1'}" /></label>
      <div data-show="water">
        <label class="field"><span>Litrů v jednom balení</span>
          <input name="packageSize-water" type="number" inputmode="decimal" min="0" step="any" value="${selected === 'water' ? value('packageSize') : ''}" placeholder="např. 1,5" /></label>
      </div>
      <div data-show="food">
        <label class="field"><span>kcal v jednom balení<small>najdete na obalu</small></span>
          <input name="packageSize-food" type="number" inputmode="numeric" min="0" step="any" value="${selected === 'food' ? value('packageSize') : ''}" placeholder="např. 350" /></label>
        <details class="helper"><summary>Spočítat z kcal na 100 g</summary>
          <div class="row">
            <label class="field"><span>kcal / 100 g</span><input id="kcal-per-100" type="number" inputmode="decimal" min="0" step="any" /></label>
            <label class="field"><span>Hmotnost (g)</span><input id="grams" type="number" inputmode="decimal" min="0" step="any" /></label>
          </div>
        </details>
      </div>
      <div data-show="daily">
        <label class="field"><span>Spotřeba za den<small>kusů pro celou rodinu, např. 0,5</small></span>
          <input name="dailyUse" type="number" inputmode="decimal" min="0" step="any" value="${value('dailyUse')}" /></label>
      </div>
      <label class="field"><span>Spotřebujte do<small id="expiry-hint"></small></span>
        <input name="expiry" type="date" value="${value('expiry')}" /></label>
      <label class="field"><span>Poznámka</span>
        <textarea name="note" rows="2" maxlength="1000">${value('note')}</textarea></label>
      <p id="item-error" class="error" role="alert" hidden></p>
      <div class="dialog-actions">
        ${item ? `<button type="button" class="danger" data-action="delete-item" data-id="${escapeHtml(item.id)}">Smazat</button>` : ''}
        <span class="spacer"></span>
        <button type="button" class="secondary" data-action="close-dialog">Zrušit</button>
        <button type="submit" id="item-submit">Uložit</button>
      </div>
    </form>`;
}

/** Paper copy for when the phones are flat. */
export function renderPrintSheet(items: Item[], household: Household, today: string): string {
  const cover = coverage(items, household, today);
  const byLocation = [...items]
    .filter((item) => item.quantity > 0)
    .sort((left, right) => (left.location || NO_LOCATION).localeCompare(right.location || NO_LOCATION, 'cs')
      || left.name.localeCompare(right.name, 'cs'));
  return `
    <h1>Sklepmistr – zásoby k ${formatDate(today)}</h1>
    <p>${CATEGORIES.map((category) => `${CATEGORY_LABELS[category]}: ${cover[category].days === null ? '—' : formatDays(cover[category].days ?? 0)}`).join(' · ')}</p>
    <table>
      <thead><tr><th>Kde</th><th>Co</th><th>Kolik</th><th>Do</th></tr></thead>
      <tbody>${byLocation.map((item) => `
        <tr><td>${escapeHtml(item.location || NO_LOCATION)}</td><td>${escapeHtml(item.name)}</td>
        <td>${quantityText(item)}</td><td>${formatDate(item.expiry)}</td></tr>`).join('')}</tbody>
    </table>`;
}
