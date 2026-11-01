# Sklepmistr 🕯️

Rodinné zásoby na výpadek proudu: co máme, kde to je, kdy to projde a jak
dlouho to vydrží.

**https://alcariss.github.io/sklepmistr/**. Přihlášení přes Google nebo
GitHub, jen pro e-maily z allowlistu.

## Co umí

- **Přehled.** Na kolik dní vystačí voda, jídlo, hygiena, léky, světlo a
  energie pro vaši rodinu, porovnáno s cílem a s minimem 3 dny (doporučení
  EU a HZS ČR). Prošlé zásoby se nepočítají.
- **Trvanlivost.** Prošlé a do 30 dnů končící zásoby nahoře. U nové zásoby se
  datum předvyplní typickou trvanlivostí kategorie. Nainstalovaná aplikace
  ukazuje jejich počet na ikoně.
- **Zásoby** podle místa (sklep, spíž, …), hledání, „−1“ při spotřebě.
- **Čárové kódy.** 📷 Skenovat: neznámý kód doplní název, kategorii a
  kcal nebo litry z [Open Food Facts](https://world.openfoodfacts.org)
  (kosmetiku a drogerii z Open Beauty Facts); známý kód nabídne „+1“ nebo
  novou šarži s jiným datem. Bez kamery jde číslo opsat. Na iPhonu běží
  čtečka ZXing (WebAssembly) z adresy aplikace, na Androidu vestavěná.
  Datum spotřeby kód neobsahuje, to se zadává ručně.
- **Nákup.** Co dokoupit na cílový počet dní, co vyměnit, a kontrolní seznam
  základních věcí (baterka, rádio, vařič, lékárnička, hotovost…).
- **Rodina.** Počet dospělých, dětí a batolat a cílový počet dní, sdílené pro
  celou rodinu.
- **Tisk.** Papírová kopie zásob, protože telefony se za výpadku vybijí.
- **Offline.** Bez sítě ukazuje poslední načtená data; měnit je jde až
  s připojením.

## Jak se počítá výdrž

| | Voda / den | Energie / den |
|---|---|---|
| Dospělý (13+) | 3 l | 2 000 kcal |
| Dítě 4–12 | 2 l | 1 800 kcal |
| Batole 1–3 | 1,5 l | 1 100 kcal |

- **Voda.** Počet balení × litrů v balení, děleno potřebou rodiny.
- **Jídlo.** Počet × kcal v balení (formulář umí spočítat z kcal/100 g a
  hmotnosti), děleno potřebou rodiny. Jídlo bez kcal se nepočítá a přehled to
  řekne.
- **Ostatní kategorie.** U položky se vyplní denní spotřeba celé rodiny.
  Kategorie vydrží tak dlouho jako položka, která dojde první.

Čísla jsou v `src/supplies.ts` (`DAILY_NEEDS`, `SUGGESTED_SHELF_LIFE_MONTHS`).

## Vývoj

Postavené na [pwa-kit](https://github.com/Alcariss/pwa-kit). Data jsou
v Grist dokumentu „Sklepmistr“ (tabulky `Items` a `Household`) za pwa-kit
workerem, aplikace `sklepmistr` v jeho `apps.ts`.

```bash
cp .env.example .env
npm install          # Node 24 / npm 11
npm run dev          # http://localhost:5173
npm test
npm run icons        # po změně public/logo.svg
```

Každý push do `main` nasadí GitHub Pages přes sdílený workflow pwa-kitu.
Přístup pro dalšího člověka: přidat e-mail do `ALLOWED_EMAILS_SKLEPMISTR`
(`npx wrangler secret put` v `pwa-kit/worker`) a v Google Cloud do
*Audience → Test users*.
