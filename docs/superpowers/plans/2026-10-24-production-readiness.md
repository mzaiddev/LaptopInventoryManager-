# Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the offline Electron inventory app safe to sell: login, super-password, discounts, cash/bank, expenses, filtered dashboard, K/M numbers, working WhatsApp statements, and data-safety hardening.

**Architecture:** Extend the existing services/IPC/page pattern. Security is enforced in the main process (an IPC guard), not in the UI. Schema changes go through numbered, backed-up migrations. Money logic lives in services and is unit-tested.

**Tech Stack:** Electron 33, better-sqlite3 11, vanilla JS renderer, `node:test` (run under Electron's Node), Node `crypto.scrypt`. No new dependencies.

**Spec:** `SPEC.md` (project root)

## Global Constraints

- Offline only, Windows, single owner role, no new npm dependencies.
- Payment methods in the UI: exactly `Cash` and `Bank Transfer` (stored `Cash` / `Bank`).
- `total_amount` on `sale_issues` stays the net (after discount) amount.
- IPC result shape stays `{ success: true, data } | { success: false, error }`.
- Never test against the live DB at `%APPDATA%\LaptopInventoryManager\data\inventory.db`; use `:memory:` or a copy.
- Compact format: `<1000` exact, `12.5K`, `3.2M`, max 1 decimal, `.0` dropped.
- No timers or timeouts anywhere and none mentioned in the UI: super-password is asked per edit/delete (one-shot); cost reveal lasts until Hide or logout.

## Review Focus

- Discount larger than the line or sale (or percent > 100) must be rejected, never produce a negative total.
- Return after a discounted sale refunds the net price actually paid, not the list price.
- Deleting or editing a sale or payment that has a discount keeps `paid + remaining = total` and the ledger balanced.
- Compact rounding at boundaries (`999,950`, `999,999`, negatives) must not show `1000K` or lose the sign.
- Phone numbers typed as `0300-123 4567`, `+92 300…`, empty, or letters must produce a valid wa link or a clear warning.
- Migration run twice, or on an already-migrated DB, must be a no-op and must not lose rows.

---

### Task 1: Test harness, versioned migrations, money helper

**Files:**
- Create: `scripts/run-tests.js`, `src/database/migrate.js`, `src/utils/money.js`, `tests/money.test.js`, `tests/migrate.test.js`
- Modify: `package.json` (`"test": "node scripts/run-tests.js"`), `src/database/dbInit.js` (call `runMigrations(db, dbPath)` after the existing baseline), delete `src/services/_rewrite_ledger.js` (grep first: nothing requires it)

**Interfaces:**
- Produces: `roundMoney(n: number): number` (2 decimals, half away from zero); `runMigrations(db, { backupFn }): number` returns final `user_version`; migrations are `{ version, up(db) }` objects in `src/database/migrations/NNN-name.js`, applied in order inside a transaction, `backupFn(version)` called before each.

- [ ] **Step 1: Write failing tests** — `roundMoney(1.005) === 1.01`, `roundMoney(-2.345) === -2.35`, `roundMoney(0.1+0.2) === 0.3`; `runMigrations` on `:memory:` with two fake migrations ends at `user_version 2`, calls `backupFn` twice, a second run calls it zero times, and a migration that throws leaves `user_version` unchanged and its table absent.
- [ ] **Step 2: Run** `npm test` → FAIL (modules missing).
- [ ] **Step 3: Implement** `roundMoney` (`Math.sign(n)*Math.round((Math.abs(n)+Number.EPSILON)*100)/100`), `runMigrations`, `scripts/run-tests.js` (spawn `electron.exe --test tests/` with `ELECTRON_RUN_AS_NODE=1`, forward exit code). `backupFn` in dbInit copies the DB file to `backups/pre-migration-<v>-<timestamp>.db`.
- [ ] **Step 4: Run** `npm test` → PASS. Also `npm start` once: app opens on a copy of the live DB with row counts unchanged.
- [ ] **Step 5: Commit** `feat: test harness, versioned migrations, money helper`

### Task 2: Auth service (hashing, login, super-password)

**Files:**
- Create: `src/database/migrations/001-users.js`, `src/services/authService.js`, `tests/auth.test.js`

**Interfaces:**
- Consumes: `runMigrations` (Task 1).
- Produces (`authService` singleton):
  - `setOwner({ username, password, superPassword }): void` (vendor/first-run only)
  - `login(username, password): { ok: true } | { ok: false, error: "INVALID" }`
  - `logout(): void`; `isLoggedIn(): boolean`
  - `verifySuper(superPassword): boolean`; `grantSuperOnce(superPassword): boolean` then `consumeSuper(): boolean` (true once, then false); `revealCost(superPassword): boolean`, `hideCost(): void`, `isCostVisible(): boolean` (cleared on logout)
  - `changePassword(current, next): void`; `changeSuperPassword(current, next): void`
  - `getInstallId(): string` (random id created once, stored in `settings`)
  - Injectable clock: `authService._setNow(fn)` for tests.

- [ ] **Step 1: Write failing tests**: correct login ok; wrong password → `INVALID`; `grantSuperOnce` wrong → false, right → `consumeSuper()` true once then false; `revealCost` right → `isCostVisible()` true, `logout()` clears it; stored hash column never contains the plain password; `changePassword` with wrong current throws.
- [ ] **Step 2: Run** `npm test` → FAIL.
- [ ] **Step 3: Implement** with `crypto.scryptSync` (16-byte salt, store `salt:hash` hex) and `timingSafeEqual`. Super hash in `settings.super_password_hash`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(auth): owner login and super-password`

### Task 3: IPC guard, login screen, settings password page

**Files:**
- Modify: `src/ipc/ipcHandlers.js` (wrap handlers via `secureHandle(channel, fn)`; public channels: `auth:*` only), `src/preload/preload.js` (add `login`, `logout`, `authStatus`, `unlockSuper`, `changePassword`, `changeSuperPassword`), `src/renderer/index.html`, `src/renderer/app.js` (show login before `init`), `src/renderer/pages/settings.js` (password section)
- Create: `src/renderer/pages/login.js`, `tests/ipcGuard.test.js`

**Interfaces:**
- Produces: `secureHandle(ipcMain, authService, channel, fn)` exported from `src/ipc/guard.js` (create) returning the wrapped handler; renderer receives `{ success:false, error:"AUTH_REQUIRED" }` which `app.js` turns into the login screen.

- [ ] **Step 1: Write failing test** for `guard.js`: a wrapped handler returns `AUTH_REQUIRED` and does not call `fn` when `isLoggedIn()` is false; calls `fn` when true; `auth:login` channel is allowed while logged out.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** guard and replace every `ipcMain.handle(` in `ipcHandlers.js` with the guarded variant (mechanical; the count of registered channels must stay equal — assert in the test by counting).
- [ ] **Step 4: Run** `npm test` → PASS. Manual: start app → login screen; wrong password shows error; right password opens dashboard; Settings changes password and super-password.
- [ ] **Step 5: Commit** `feat(auth): guard all IPC, login screen, password settings`

### Task 4: Vendor console

**Files:**
- Create: `src/services/vendorService.js`, `tools/vendor-keygen.js`, `src/renderer/pages/vendor.js`, `tests/vendor.test.js`
- Modify: `src/renderer/app.js` (Ctrl+Shift+V opens console when not logged in or logged in), `src/ipc/ipcHandlers.js`, `src/preload/preload.js`, `package.json` build `files` (exclude `tools/**`)

**Interfaces:**
- Produces: `signInstallId(installId: string, privateKeyPem: string): string` in `tools/vendor-keygen.js` (ed25519 signature, base64url); `vendorService.verifyKey(installId, key): boolean` (`crypto.verify` against the public key embedded in `src/config/vendorPublicKey.js`); `vendorService.provision({ installId, key, shopName, username, password, superPassword })` calls `authService.setOwner` and updates `shop_name`.

- [ ] **Step 1: Write failing tests**: key from the keygen for install A verifies on A and fails on B; wrong key throws and does not change the owner; provision updates username/hash and shop name.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the three pieces. The keygen has `--init` (writes a vendor ed25519 key pair; the private key stays outside the repo) and `<installId>` (prints the key). Asymmetric on purpose: the shipped app holds only the public key and cannot forge keys. Tests use a throwaway key pair.
- [ ] **Step 4: Run** → PASS. Manual: generate key for the shown install id, provision, log in with new credentials.
- [ ] **Step 5: Commit** `feat(vendor): offline per-install vendor console`

### Task 5: Compact numbers

**Files:**
- Modify: `src/renderer/utils/formatters.js`, `src/renderer/components/Table.js` (currency format cells), `src/renderer/pages/dashboard.js` (card values), `src/renderer/utils/printService.js`
- Create: `src/shared/compact.js` (UMD-style: usable by `require` in tests and by a `<script>` tag), `tests/compact.test.js`
- Modify: `src/renderer/index.html` (load `compact.js`)

**Interfaces:**
- Produces: `formatCompact(n: number | null | undefined): string`; `Formatters.formatMoney(amount, currency): string` returns compact form when `App.compact !== false`, with callers adding `title=exact`. `settings.compact_numbers` ('1'/'0').

- [ ] **Step 1: Write failing tests**: `0→"0"`, `999→"999"`, `1000→"1K"`, `12500→"12.5K"`, `999950→"1M"`, `999999→"1M"`, `1000000→"1M"`, `3250000→"3.3M"` (half-up), `-1500→"-1.5K"`, `null→"-"`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `formatCompact`; switch card/table/print/WhatsApp call sites from `formatCurrency` to `formatMoney`; add Settings toggle.
- [ ] **Step 4: Run** → PASS. Manual: dashboard, a table, a printed statement show K/M; toggle off shows exact.
- [ ] **Step 5: Commit** `feat: compact K/M number display`

### Task 6: Discounts and Cash/Bank on sales

**Files:**
- Create: `src/database/migrations/002-discounts.js`, `tests/sales.test.js`
- Modify: `src/services/ledgerService.js` (`createSale`, `updateSale`, `createReturn`, `addPayment`), `src/renderer/pages/sales.js`, `src/renderer/pages/salesHistory.js`

**Interfaces:**
- Consumes: `roundMoney` (Task 1).
- Produces: `createSale({ customer_id, issue_date, items: [{ product_id, quantity, unit_price, discount_amount? }], discount_type?: "none"|"amount"|"percent", discount_value?, ledger_type, paid_amount?, payment_method: "Cash"|"Bank", notes? }) → { saleId, referenceNo }`; helper `computeSaleTotals(items, discount_type, discount_value): { subtotal, itemDiscount, saleDiscount, total }` exported from `src/services/saleMath.js` (create, pure).

- [ ] **Step 1: Write failing tests** on `computeSaleTotals`: 2×1000 with item discount 200 and sale 10% → subtotal 2000, itemDiscount 200, saleDiscount 180, total 1620; item discount > gross throws; percent 101 throws; amount > subtotal-after-items throws; total never < 0. DB-level tests (in-memory schema via `dbInit` test factory): created sale has `total_amount` = net, `paid + remaining = total`, payment row stores `Bank`; a return of 1 of 2 discounted units refunds the prorated net unit price; `updateSale` with a new discount keeps the ledger sum equal to total.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `saleMath.js`, migration 002 (nullable defaults 0/'none'), wire into `createSale/updateSale/createReturn`; UI: discount fields (per line, and per sale with amount/% toggle), payment radio Cash / Bank Transfer, live total preview; history/print show subtotal, discount, net.
- [ ] **Step 4: Run** → PASS. Manual on a DB copy: sell with discount, pay half by bank, check ledger and sale history.
- [ ] **Step 5: Commit** `feat(sales): discounts and cash/bank payments`

### Task 7: Expenses

**Files:**
- Create: `src/database/migrations/003-expenses.js`, `src/services/expenseService.js`, `src/renderer/pages/expenses.js`, `tests/expenses.test.js`
- Modify: `src/ipc/ipcHandlers.js`, `src/preload/preload.js`, `src/renderer/index.html` (nav + script), `src/renderer/app.js` (route `expenses`)

**Interfaces:**
- Produces (`expenseService`): `add({ expense_date, category, amount, payment_source: "Cash"|"Bank", note? }): { id }`; `update(id, data)`; `remove(id)`; `list({ from?, to?, search?, page?, pageSize? }): { rows, total, sum }`; `totals({ from, to }): { total, cash, bank, byCategory: [{category, amount}] }`. IPC: `expense:add|update|delete|list|totals`.

- [ ] **Step 1: Write failing tests**: amount 0/negative/NaN rejected; invalid source rejected; `totals` for a seeded range equals hand sum, split by source and category; `list` filters by date inclusive and paginates.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** service, migration, IPC, page (form, table with Pagination component, category totals, delete confirm via Modal).
- [ ] **Step 4: Run** → PASS. Manual: add, edit, delete, filter.
- [ ] **Step 5: Commit** `feat: expenses module`

### Task 8: Super-password on product edit/delete, purchase price masking

**Files:**
- Modify: `src/ipc/ipcHandlers.js` (`inventory:update/delete` require `consumeSuper()`; add `auth:grantSuper`, `auth:revealCost`, `auth:hideCost`), `src/services/inventoryService.js` (`stripCost(rows, visible)`), `src/renderer/pages/inventory.js`, `src/renderer/pages/reports.js`, `src/renderer/components/Modal.js` (super-password prompt helper)
- Create: `tests/inventoryMask.test.js`

**Interfaces:**
- Produces: `stripCost(productOrRows, visible: boolean)` sets `purchase_price` to `null` when locked; UI helper `promptSuper(): Promise<boolean>`.

- [ ] **Step 1: Write failing tests**: `stripCost` nulls `purchase_price` for object and array when locked, untouched when unlocked; `inventory:update` handler without a granted super-password returns `{success:false,error:"SUPER_REQUIRED"}` and does not write.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**; every channel that returns products or damage/inventory reports passes through `stripCost`; UI shows `••••` for null and an "Unlock" button; edit/delete buttons call `promptSuper()` first, which calls `auth:grantSuper`.
- [ ] **Step 4: Run** → PASS. Manual: product list hides cost; edit asks for super-password; wrong one is refused; right one lets that single edit through.
- [ ] **Step 5: Commit** `feat(security): super-password gate and cost masking`

### Task 9: Dashboard filter, trimmed cards, cash/bank balances

**Files:**
- Modify: `src/services/dashboardService.js`, `src/renderer/pages/dashboard.js`, `src/ipc/ipcHandlers.js` (`dashboard:getData` takes `{from,to}`), `src/preload/preload.js`
- Create: `tests/dashboard.test.js`

**Interfaces:**
- Consumes: expense `totals` (Task 7), discounted `total_amount` (Task 6), `stripCost` (Task 8).
- Produces: `getDashboardData({ from, to }, { costVisible }): { sales, received: {cash, bank}, outstanding, expenses: {total, cash, bank}, netProfit | null, cashInHand, bankBalance, lowStock }` where `cashInHand = Σcash payments − Σcash expenses` and `bankBalance = Σbank payments − Σbank expenses` (all time); `netProfit = sales net − COGS − expenses` for the range, `null` when locked.

- [ ] **Step 1: Write failing tests** on a seeded fixture: known sales/payments/expenses across two months produce hand-computed values for range = this month; `cashInHand` ignores the range; locked → `netProfit === null`; empty DB returns zeros, no NaN.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**; UI: preset buttons (Today, 7 days, This month, Last month, Custom), card set per `SPEC.md`, remove the other sections after owner confirms the list (Open Question 1; until then hide behind a collapsed "More details").
- [ ] **Step 4: Run** → PASS. Manual: switch ranges, numbers change, cash/bank cards match payments.
- [ ] **Step 5: Commit** `feat(dashboard): date filter, cash/bank balances, trimmed cards`

### Task 10: WhatsApp PDF statement flow

**Files:**
- Create: `src/services/statementService.js`, `tests/statement.test.js`
- Modify: `src/ipc/ipcHandlers.js` (`statement:exportAndShare`), `src/preload/preload.js`, `src/renderer/pages/customers.js` (replace `shareStatementWhatsApp` body, remove `_openPdfWindow` use), `src/renderer/pages/ledgers.js` (same button if present)

**Interfaces:**
- Produces: `normalizePhone(raw: string, defaultCountryCode: string): string | null` (digits only; strip leading `0` then prefix country code; keep numbers already starting with `+`/country code; `null` if fewer than 8 digits); `escapeHtml(s)`; `exportAndShare({ customerId }): { pdfPath, clipboardOk, waOpened }` in main: render HTML in a hidden `BrowserWindow`, `webContents.printToPDF({ pageSize:"A4", printBackground:true })`, write to `Documents/LaptopInventoryManager/Statements/<name>-<yyyymmdd>.pdf`, `powershell Set-Clipboard -Path`, `shell.openExternal("whatsapp://send?phone=..&text=..")` then fallback `https://wa.me/..`; on clipboard failure `shell.showItemInFolder`.

- [ ] **Step 1: Write failing tests** for `normalizePhone`: `"0300-123 4567","92"→"923001234567"`, `"+92 300 1234567"→"923001234567"`, `"923001234567"→` same, `""`/`"abc"`/`"123"→null`; `escapeHtml("<script>")` has no raw `<`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**; PDF/clipboard/openExternal parts are verified manually (Electron APIs), the pure helpers by tests. UI toast: "PDF saved and copied — open the chat and press Ctrl+V".
- [ ] **Step 4: Run** `npm test` → PASS. Manual with WhatsApp Desktop installed: click Share → chat opens with message, Ctrl+V pastes the PDF; with WhatsApp not installed the browser wa.me page opens and the folder is revealed; customer without phone shows a warning and still saves the PDF.
- [ ] **Step 5: Commit** `feat(whatsapp): real PDF export and share flow`

### Task 11: Backup, restore safety, audit log, error log

**Files:**
- Create: `src/database/migrations/004-audit.js`, `src/services/auditService.js`, `src/utils/logger.js`, `tests/backupRestore.test.js`, `tests/audit.test.js`
- Modify: `src/services/backupService.js`, `src/main/main.js` (daily + on-exit backup, single-instance lock, global error handlers, hide DevTools menu when `app.isPackaged`), `src/services/ledgerService.js` and `src/services/inventoryService.js` (call `auditService.log` on delete/edit), `src/renderer/pages/backup.js`

**Interfaces:**
- Produces: `auditService.log(action: string, entity: string, entityId: number | null, detail?: object): void`; `auditService.list({ page, pageSize }): rows`; `backupService.verify(filePath): { ok: boolean, error?: string }` (opens read-only, `PRAGMA integrity_check` equals `ok`, has `products` and `customers` tables); `backupService.pruneOld(keep = 30): number`.

- [ ] **Step 1: Write failing tests**: `verify` rejects a text file renamed `.db` and a DB lacking required tables, accepts a real copy; `restore` of a bad file leaves the current DB byte-identical; `pruneOld(2)` with 4 files keeps the 2 newest; `log` then `list` returns the entry newest first.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**; restore = verify → safety backup of current → copy → reopen.
- [ ] **Step 4: Run** → PASS. Manual: corrupt file restore refused; delete a sale and see it in the audit list; kill the app mid-session, restart, data intact.
- [ ] **Step 5: Commit** `feat(hardening): safe restore, auto backup, audit and error logs`

### Task 12: Scale, integrity check, CSP, release build

**Files:**
- Create: `src/database/migrations/005-indexes.js`, `src/services/integrityService.js`, `tests/scale.test.js`, `tests/integrity.test.js`
- Modify: `src/renderer/index.html` (CSP meta), `package.json` (build `files` excludes `tools/**`, `tests/**`, `docs/**`), `src/renderer/pages/settings.js` (button: "Check data integrity")

**Interfaces:**
- Produces: `integrityService.check(): { ok: boolean, problems: [{ customerId, expected, actual }] }` comparing per customer `Σ ledger debit − Σ ledger credit` with `Σ sale remaining + old balance net`.

- [ ] **Step 1: Write failing tests**: seeding 3,000 customers and 1,000 products then `searchCustomers("ali")` and product search complete under 100 ms each; `check()` is ok on a consistent fixture and reports the customer when a ledger row is tampered.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** indexes (`customers(customer_name)`, `customers(phone)`, `sale_issues(customer_id, issue_date)`, `payments(sale_issue_id)`, `customer_ledger(customer_id)`), `check()`, CSP `default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'`; fix any inline handlers it breaks only if the CSP forces it (inline `onclick` is used widely: use `script-src 'self' 'unsafe-inline'` and note it as debt).
- [ ] **Step 4: Run** `npm test` → PASS; `npm run build:installer` succeeds; install on a clean user, run the full day-flow checklist in `SPEC.md` objective.
- [ ] **Step 5: Commit** `feat: scale indexes, integrity check, CSP, release config`

---

## Checkpoints

- After Tasks 1–4: `npm test` green; app is unusable without login; vendor can provision.
- After Tasks 5–9: full day flow works (sale with discount → bank/cash payment → expense → dashboard range → numbers in K/M).
- After Tasks 10–12: WhatsApp flow verified by hand; installer built; clean-machine run.

## Self-review notes

- Spec coverage: each requirement in `SPEC.md` maps to a task (foundation→1, auth→2–4, inventory-security→8, compact→5, sales→6, expenses→7, dashboard→9, whatsapp→10, hardening→11–12).
- Types: `roundMoney`, `computeSaleTotals`, `stripCost`, `expenseService.totals`, `authService.isSuperUnlocked` are named identically where consumed.
- Known limit: Task 4 uses ed25519 signatures so the shipped app cannot mint keys; the vendor private key must be kept off this repo.
