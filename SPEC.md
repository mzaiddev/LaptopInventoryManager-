# Spec: Laptop Inventory Manager — Production Readiness

Status: DRAFT for owner review. Written 2026-10-24.

## Capability Map

| Module id | Responsibility | Depends on |
|---|---|---|
| `foundation` | Versioned migrations, pre-migration backup, test harness, money rounding helper, remove dead code | — |
| `auth` | Single-owner login, super-password, session guard on every IPC call, vendor console | foundation |
| `inventory-security` | Product edit needs super-password; purchase price/profit masked until unlocked | auth |
| `compact-numbers` | `12.5K` / `3.2M` display everywhere | foundation |
| `sales-payments` | Sale discount (whole sale + per item), Cash / Bank Transfer on every payment | foundation, auth |
| `expenses` | Expense CRUD, paid from Cash or Bank | foundation, auth |
| `dashboard` | Date-range filter, trimmed cards, cash-in-hand and bank balance | sales-payments, expenses, compact-numbers |
| `whatsapp-statements` | Real PDF export + WhatsApp flow that works offline | auth, compact-numbers |
| `hardening` | Auto backup, safe restore, audit log, error log, CSP, installer checks | all |

Build order: foundation → auth → (inventory-security, compact-numbers, sales-payments, expenses) → (dashboard, whatsapp-statements) → hardening.

## Objective

Make the existing Electron + SQLite wholesale laptop app safe to sell to shops as an offline product (SaaS-style licensing by the vendor, data stays on the shop's PC). User: one shop owner per install. Success: the owner can run a full day (sell with discount, take cash/bank payment, record expenses, view the dashboard for any date range, send a statement on WhatsApp) with correct numbers, and no data is lost on crash, bad migration or restore.

## Decisions from the owner (2026-10-24)

- One role (owner). Login for the whole system.
- Owner can set the passwords from Settings (login password and super-password).
- Vendor (the developer) creates the owner's credentials from a separate page, because the product is sold as SaaS.
- Payment forms: **Cash** and **Bank Transfer** only.
- Discount: per sale, and also on a specific product line.
- K/M compact numbers also on WhatsApp and printouts.
- Scale: ~1,000 products, ~2,000–3,000 customers. Offline only.
- Live DB found: `%APPDATA%\LaptopInventoryManager\data\inventory.db` (copy used for planning; it holds 1 product, 1 customer, 2 sales, i.e. test data).

## Assumptions (correct me)

1. Windows 10/11 only, one PC per shop, no sync.
2. Currency uses whole units; money stays `REAL` but every calculation goes through `roundMoney()` (2 decimals). No integer-cents rewrite.
3. Vendor console is unlocked by a per-install key generated offline by a vendor-only CLI (see `auth`), not a hardcoded password.
4. Staff users do not exist; "hidden purchase price" means hidden from whoever is at the screen until the super-password is entered (revealed on request, hidden again on Hide or logout).
5. Refunds on returns are not tracked as cash/bank outflow today; cash-in-hand ignores them unless Open Question 3 says otherwise.

## Commands

```
Start:        npm start
Dev:          npm run dev
Test:         npm test            (node:test run under Electron's Node; better-sqlite3 is built for Electron)
Installer:    npm run build:installer
Portable:     npm run build:portable
```

`npm test` = `node scripts/run-tests.js`, which spawns `node_modules/electron/dist/electron.exe --test tests/` with `ELECTRON_RUN_AS_NODE=1` (verified working on this machine).

## Project Structure

```
src/main, src/preload, src/ipc   Electron main, preload bridge, IPC handlers
src/database                     dbInit.js + new migrations/ (numbered files)
src/services                     business logic, one service per area (new: authService, expenseService, statementService)
src/renderer/pages, components   UI
tests/                           node:test files, in-memory SQLite
tools/vendor-keygen.js           vendor-only, NOT in electron-builder "files"
docs/superpowers/plans           implementation plan
```

## Code Style

Match existing code: CommonJS services as classes exported as singletons, `{success, data|error}` IPC results, renderer pages as object literals.

```js
class ExpenseService {
  add(data) {
    const db = getDatabase();
    if (!(data.amount > 0)) throw new Error("Amount must be greater than 0");
    const r = db.prepare("INSERT INTO expenses (...) VALUES (...)").run(/* ... */);
    return { id: r.lastInsertRowid };
  }
}
module.exports = new ExpenseService();
```

## Module Requirements and Acceptance Criteria

### foundation
- DB version tracked with `PRAGMA user_version`; existing inline migrations become baseline v1; new changes are numbered files run in a transaction, each preceded by a file copy of the DB into `backups/pre-migration-<version>-<ts>.db`.
- `roundMoney(n)` helper used by all sale/payment/expense math.
- `src/services/_rewrite_ledger.js` deleted (unused leftover; confirm by grep).
- AC: opening a copy of the live DB migrates without data change (row counts equal); a failing migration leaves the DB at the old version.

### auth
- Table `users` (single owner row), `scrypt` hash with per-row salt, no dependency. Separate `super_password_hash` in `settings`.
- Login screen blocks the app. Session lives in the main process; every IPC channel except `auth:*` returns `{success:false, error:"AUTH_REQUIRED"}` without a session.
- Settings page: change login password and super-password (requires current one).
- Vendor console (separate page, shortcut Ctrl+Shift+V): input = vendor key; it can set shop name, set/reset owner username + password + initial super-password. Key = ed25519 signature of `installId` made with the vendor's private key; `installId` is shown on the login screen; `tools/vendor-keygen.js <installId>` prints the key. The app ships only the public key, so it cannot mint keys.
- AC: no IPC data call works before login (tested); wrong super-password never unlocks; passwords never stored or logged in plain text.

### inventory-security
- `inventory:update` and `inventory:delete` each need the super-password for that one action (checked in main, one-shot).
- `purchase_price`, COGS, profit and stock valuation are returned as `null` and shown as `••••` until unlocked; applies to inventory table, details, exports, reports, dashboard, WhatsApp/print.
- AC: with a locked session, `inventory:getAll` payloads contain no `purchase_price` (tested at service level).

### compact-numbers
- `Formatters.formatCompact(n, currency?)`: `<1000` exact; `1,000–999,999` → `12.5K`; `≥1,000,000` → `3.2M`; max 1 decimal, trailing `.0` dropped; negatives keep sign; boundary `999,950` → `1M`; non-numbers → `-`.
- Applied to dashboard, tables, WhatsApp text and printed statements, per owner. Full value in a `title` tooltip on screen. Setting `compact_numbers` (default on) turns it off.
- AC: unit tests for 0, 999, 1000, 12500, 999950, 1,000,000, 3,250,000, -1500, null.

### sales-payments
- `sale_issues` gains `subtotal`, `discount_type` ('none'|'amount'|'percent'), `discount_value`, `discount_amount`; `sale_issue_items` gains `discount_amount`. `total_amount` stays the **net** amount, so the ledger, balances and reports keep working.
- Rules: item discount ≤ item gross; sale discount ≤ subtotal after item discounts; percent 0–100; total never negative.
- Payment form: radio Cash / Bank Transfer (stored as `Cash` / `Bank`; legacy `Online`/`Other` rows are displayed as Bank).
- Returns value goods at the net price actually charged (discount prorated).
- `updateSale` and `deleteSale` stay consistent with discounts.
- AC: 2×1000 with 10% item discount and 100 sale discount = 1700; paid + remaining = total; return of 1 unit refunds 850.

### expenses
- Table `expenses(id, expense_date, category, amount>0, payment_source 'Cash'|'Bank', note, created_at)`. Page: add/edit/delete, search, date filter, category totals, pagination. Delete asks for confirmation.
- AC: amount ≤ 0 rejected; totals by range match the sum of rows.

### dashboard
- Date filter presets: Today, 7 days, This month, Last month, Custom. Applies to sales, received, expenses, profit. Stock cards are labelled "now".
- Cards (replace the current detail-heavy set): Sales, Received (Cash / Bank), Outstanding, Expenses, Net profit (locked → `••••`), Cash in hand, Bank balance, Low stock.
- Cash in hand = Cash payments − Cash expenses (all time, not date-filtered). Bank balance = Bank payments − Bank expenses.
- AC: figures equal a hand computation on a seeded fixture (tested at service level).

### whatsapp-statements
- Current behaviour (verified in `customers.js:651`): opens a print window and `window.open("https://wa.me/<phone>?text=...")`. No PDF is ever attached; wa.me cannot attach files.
- New flow, one button: main process renders the statement to PDF (`printToPDF`) in `Documents\LaptopInventoryManager\Statements\`, puts the file on the Windows clipboard (`Set-Clipboard -Path`), opens `whatsapp://send?phone=...&text=...` with fallback to `https://wa.me/...` through `shell.openExternal`, and shows "PDF copied — press Ctrl+V in the chat". If clipboard fails, it opens the folder with the file selected.
- Phone normalised with setting `default_country_code` (default `92`; leading `0` stripped).
- Honest limit: WhatsApp does not let any app attach a file by link. Fully automatic sending needs the WhatsApp Business Cloud API, which requires internet and a Meta account, so it is out of scope for an offline product.
- Statement HTML escapes all customer/product text.
- AC: PDF file exists and is > 0 bytes; phone `0300-1234567` → `923001234567`; a name containing `<script>` renders as text.

### hardening
- Auto backup: on exit and daily, keep last 30, folder from settings; restore runs `PRAGMA integrity_check` on the chosen file and makes a safety backup first.
- Audit log table (who/what/when) for sale delete, payment delete, product delete/edit, restore, password change.
- Error log file in userData; global `uncaughtException`/`unhandledRejection` handlers; single-instance lock; DevTools menu hidden in packaged builds; CSP meta in `index.html`.
- Indexes for 3,000 customers / 1,000 products: name/phone search, `sale_issues(customer_id, issue_date)`, `payments(sale_issue_id)`.
- Data-integrity check command: sum of ledger = sum of sales − payments per customer.
- AC: restoring a corrupted file is refused and the current DB is untouched; customer search over a 3,000-row seed returns in < 100 ms.

## Testing Strategy

`node:test` + `better-sqlite3` `:memory:`, files in `tests/`, one per service. UI is checked by hand with a checklist per module (no browser test framework; avoids a new dependency). Money, auth, discount and migration logic must have tests before the code (red → green). Every module ends with a manual run on a **copy** of the live DB.

## Boundaries

- Always: back up before any migration; run `npm test` before commit; validate in main (never trust the renderer); escape HTML in prints.
- Ask first: new npm dependencies; changing the ledger model; deleting columns/tables; changing the installer config.
- Never: touch `%APPDATA%\LaptopInventoryManager\data\inventory.db` directly while testing (use the copy); ship the vendor private key or keygen in the installer; store plain-text passwords; commit `.db` files.

## Open Questions

1. Dashboard "extra details": I have not seen the screens running. Please confirm the card list above, or send a screenshot of what confuses the client.
2. K/M on printed statements rounds (12,480 → 12.5K), so a customer's debt can look different from the real figure. I follow your instruction, with a Settings switch. Do you want exact amounts for the "Balance due" line only?
3. Do cash refunds on returns leave the cash drawer? If yes, returns need a refund method and amount.
4. Vendor console: is the per-install key scheme above acceptable, or do you want a plain vendor password?
5. (Resolved 2026-10-24) No timers anywhere: super-password is asked per edit/delete; cost reveal lasts until Hide or logout.
6. (Resolved) Returns keep crediting the customer balance; no cash/bank refund tracking.
