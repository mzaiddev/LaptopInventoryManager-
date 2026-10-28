# Master Plan — Shop Manager (today: Laptop Inventory Manager)

Status: IN PROGRESS. Written 2026-10-28 after reading every page, service and migration; progress updated below.
Each phase gets its own short spec, task list and test-first build.

## Progress (what is built)

| Item | State |
|---|---|
| F1 Smart defaults | Customers (due filter, Due column, print default) done. Suppliers "With balance" default and Inventory "Available to sell" default done, both remembered per PC. Reports and ledger pickers still to do |
| F2 Task Center | Built (jobs tables, queue service, top-right panel, WhatsApp and product import tasks). Export tasks and scheduled work still to do |
| F3 Lists & Setup | Built: product categories, expense categories, storage locations; rename, merge, hide, delete-if-unused, reorder, usage counts. Units, conditions, payment accounts, price tiers still to do |
| F4 Business profile | Not started |
| F5 Attention center and health page | Not started (global search is built) |
| F6 Undo, recycle bin, day lock | Not started |
| F7 Import/Export engine | Product CSV import built; shared engine for customers, suppliers and exports still to do |
| A Google Drive backup | Service and Backup page built; needs the app's Google client ID configured before real use |
| UI refresh | Shared stylesheet built (light and dark, grouped sidebar, tabs, tables, status pills). Page-by-page polish and the floating bulk-action bar still to do |
| Phases 5 to 11 | Not started |

Release 1 is phases 0 to 4. Phases 5 and later start after real client feedback on Release 1.
This file replaces `docs/client-value-roadmap.md`.

Sizes: **S** 1–2 days · **M** 3–5 days · **L** 1–2 weeks · **XL** more than 2 weeks.

---

## 1. Vision and rules

**Goal.** A system the shop owner can run all day without thinking about it: it shows what matters first, never loses data, does slow work in the background, and can be sold to any kind of shop, not only laptop dealers.

**Six rules every phase must follow**

1. **Smart defaults.** Every list, report, print dialog and send-picker starts with what the owner needs to see (for example customers who owe money) and has one visible switch to widen it. The choice is remembered per screen.
2. **Slow work never blocks.** Anything that takes more than a couple of seconds becomes a **task** in the Task Center: it shows in the top-right, the owner keeps working, and the result is kept in a history.
3. **Nothing hardcoded that a shop would want to change.** Categories, expense types, units, conditions, payment accounts, price tiers and wording live in Settings → *Lists & Setup*, not in code.
4. **The owner is told, not asked to remember.** Backup overdue, customers overdue, stock low, cash negative: shown on the dashboard and in a bell.
5. **Safe by design.** Every destructive action can be undone or is audited; every new IPC call is covered by login/super-password checks and the audit list; backups are verified before restore.
6. **English and Urdu from day one.** Every new text gets its Urdu entry in the same change (there is a test for missing entries).

---

## 2. What exists today (short)

Electron + SQLite, Windows, one owner, offline. English/Urdu.

| Area | Present |
|---|---|
| Sales | Create sale/issue, cash or loan, discounts (sale + line), payments Cash/Bank, invoice print/PDF, bulk WhatsApp invoices |
| Customers | List, profile, statement (print/PDF/WhatsApp), ledger, old balances |
| Money | Expenses, cash & bank book, supplier ledger (bills/payments), returns, damage records |
| Stock | Products, status, condition, inspection notes, hidden purchase price |
| Insight | Dashboard with date range and "how is this worked out"; 5 report tabs |
| Safety | Login + super-password, audit log, integrity check, daily auto-backup (30 kept), verified restore, error log, single-instance lock |
| Messaging | WhatsApp linked by QR (Baileys), auto-send PDF, one-by-one bulk queue |
| Vendor | Vendor console with per-install key |

## 3. Audit findings (what is wrong or missing today)

**Hardcoded lists (found in code)**

| What | Where | Problem |
|---|---|---|
| Product categories | `inventory.js` (`DEFAULT_CATEGORY_OPTIONS`), `Modal.js` | Fixed laptop-shop list; the filter list is `SELECT DISTINCT category` from products, so typos ("Laptop", "laptop ", "Lap top") become separate categories |
| Expense categories | `expenses.js` (`categories`) | Fixed list in a free-text box, same duplicate problem |
| Condition and status | DB `CHECK(...)` on `products` | Laptop wording (Excellent/Good/Fair/For Parts); changing needs a table rebuild |
| Payment methods | DB `CHECK(...)` on `payments`, `expenses`, `supplier_ledger` | Only Cash/Bank; no EasyPaisa/JazzCash/second bank |
| Wording | `index.html`, `main.js`, pages | "Laptop Inventory Manager" in titles and menu |
| Product fields | `products` table | Serial number, warranty (free text), model assume electronics |

**Behaviour gaps**

| Area | Gap |
|---|---|
| Heavy work | Bulk WhatsApp runs in a pop-up; closing it stops sending. Busy overlay blocks all clicks. Nothing is queued or remembered |
| Backup | Backups stay on the same PC; no cloud copy; no "last backup" warning; the `auto` folder is not shown on the Backup page |
| Customers | List has no Due column, no sort by due, no "has due" filter; report prints every customer in 10 columns; its Active/Inactive filter does nothing for customers (it filters on a field customers don't have) |
| Collections | No due dates, ageing, promised-payment date or reminders |
| Stock | No low-stock level, no import/export, no barcode, no warranty expiry, no serial lookup, no photos, no stock count, no bulk edit |
| Reports | No Excel export, no daily closing, no profit by product/customer, no top lists |
| Team | One owner login only; no staff roles or day lock |
| Platform | No setup wizard, no global search, no auto-update (version 1.0.0), no health page |
| Technical | `better-sqlite3` is synchronous in the main process; a big import in one go freezes the window |

---

## 4. Foundation layer (build once, used by everything)

### F1 — Smart defaults and view presets  (M)

- Shared helper `ViewDefaults`: each screen declares its default filter and a label for the switch; the owner's choice is saved on that PC (per screen).
- Default table (also used by print dialogs and bulk-send pickers):

| Screen | Default | Switch |
|---|---|---|
| Customers report / print | Total Due ≠ 0 (credit balances stay) | "Include customers with no due" |
| Customers list | all; sortable by Due; filter "Has due" | — |
| Outstanding report, statements, reminders | due > 0 | "Include settled" |
| Suppliers | balance ≠ 0 | "Include settled suppliers" |
| Inventory, stock report, sale product picker | quantity > 0, In Stock/Reserved | "Include sold / out of stock" |
| Damages, returns, old balances | last 30 days | "All time" |
| Ledger customer picker | customers with entries | "All customers" |
| Dashboard recent lists | last 7 days | — |

- **Print layout rules** in the shared print dialog: portrait, at most 6 columns, biggest amount first, totals from the rows actually printed, "Show full details" adds the rest.
- Fix now: the Active/Inactive filter in the customer print dialog (the dialog should filter on a named field, not always `category`).
- **Acceptance:** a seeded database with 5 customers (2 owing, 1 credit, 2 zero) prints 3 rows by default and 5 with the switch; totals match the printed rows; setting survives restart.

### F2 — Task Center (background queue)  (L)

The owner clicks Send / Import / Backup, the pop-up closes at once, and a chip appears in the **top-right**: spinner + "Sending 3 of 12". The owner keeps working.

**What the owner sees**
- Chip in the top bar: running task name and progress. Several tasks → "2 running, 1 waiting".
- Click the chip → panel: each task with a progress bar, current item, Sent/Failed counts, **Stop**, **Retry failed**, **Resume**.
- Bell badge when a task finished or needs attention; toast on finish ("12 sent, 2 not sent").
- **Tasks page** (Settings or top bar): history of the last 100 tasks with details and failed items.
- Closing the app while tasks run asks first; on next start interrupted tasks show as "Interrupted — Resume".

**Heavy tasks that use it**

| Task | Lane |
|---|---|
| Bulk WhatsApp (statements, invoices, reminders, price lists) | `whatsapp` (1 at a time, keeps the 5–11 s pacing) |
| Google Drive backup upload / restore download | `cloud` |
| Create backup, verify backup | `local` |
| Bulk product / customer / opening-balance import | `data` |
| Bulk edit (change category, price, supplier on many rows) | `data` |
| Excel/PDF export of large reports; month-end pack | `export` |
| Recalculate ledgers, integrity check | `data` |

**Design**
- Tables: `jobs(id, kind, lane, title, status, total, done, failed, payload_json, result_json, error, created_at, started_at, finished_at)` and `job_items(job_id, idx, label, status, error)` so failed items can be retried. Status: `queued | running | done | partial | failed | cancelled | interrupted`.
- `JobService` in the main process owns the queue and lanes; the renderer `TaskCenter` component draws the chip/panel and receives progress events over IPC.
- One running job per lane; others wait and show "Queued after …". Different lanes run together (a Drive upload and a WhatsApp run can overlap).
- **Do not freeze the window:** `better-sqlite3` is synchronous, so data tasks work in chunks (about 200 rows per transaction) and yield between chunks. If a task still stalls the UI in testing, move it to a worker thread with its own connection (WAL allows it).
- WhatsApp jobs need the statement HTML built in the renderer today. Step 1: the renderer prepares each item and hands it to the job; step 2 (optional): build statement HTML in the main process so jobs finish even if the window is reloaded.
- Existing `BulkShare` keeps selection and message preparation; its sending loop (pacing, three-failures stop, "not on WhatsApp") moves into a job, not rewritten.
- **Acceptance (tests):** queue order; two jobs in one lane wait; two lanes overlap; stop; retry only failed; three-failures stop; interrupted job is marked on restart; a 5,000-row import keeps IPC responsive (a ping answers within 200 ms while it runs); navigating pages does not cancel a job.

### F3 — Lists & Setup (master data)  (M–L)

One Settings area, **Lists & Setup**, with a page per list. Replaces every hardcoded list. Built to be reused by any shop type.

| List | Replaces | Notes |
|---|---|---|
| Product categories | `DEFAULT_CATEGORY_OPTIONS`, `SELECT DISTINCT category` | Name, active, sort order, optional default unit and "fields shown" (see F4) |
| Expense categories | `ExpensesPage.categories` | Same screen type; used as a dropdown, no free typing |
| Units | — | pcs, box, meter, kg, dozen; decimal quantities allowed per unit |
| Conditions | DB `CHECK` on `products.condition` | Defaults Excellent/Good/Fair/For Parts; shop can rename |
| Stock statuses | DB `CHECK` on `products.status` | Keep core statuses fixed (logic depends on them); allow labels only |
| Payment accounts | Cash/Bank `CHECK`s | Keep type Cash/Bank for the math, add an **account name** (Meezan Bank, EasyPaisa, JazzCash) so reports can split by account |
| Storage locations | free text `storage_location` | Dropdown with "add new" |
| Brands | part of product name | Optional |
| Price tiers | — | Retail / Wholesale / Dealer; per-customer default tier |
| Customer groups / tags | — | Optional |
| Warranty periods | free-text `warranty` | 1 / 3 / 6 / 12 months, none |

**Rules for every list screen**
- Add, rename, reorder, **archive** (hide from new entries, keep on old records). Delete only when unused.
- Shows a **usage count** ("Laptop — 214 products").
- **Rename and merge:** renaming updates all products; "Merge into…" fixes typos (Laptop ← "laptop ").
- Pickers in forms use the list with a "+ Add new" shortcut (needs the right permission).
- First run: lists are seeded from the active business profile (F4) and from existing distinct values in the database, so no data is lost.
- **Migration risk:** DB `CHECK` constraints on condition and payment method need a table rebuild. Stage it: (1) add the lists and use them for pickers; (2) relax the checks in one migration with the existing pre-migration backup, tested on a copy of the sample data.
- **Acceptance:** typo merge updates products and reports; archived category does not appear in new-product form but still shows on old products; expense category picker has no free text; migration on a copy of live data keeps all row counts.

### F4 — Business profile and wording  (M)

So the same program can be sold to a mobile shop, general store, electronics shop or pharmacy-lite.

- Settings → **Business type**: presets *Laptop & computer dealer*, *Mobile shop*, *General store*, *Electronics*, *Custom*. A preset chooses: default categories, expense categories, units, which product fields are shown, default labels.
- **Field switches** per shop: serial number, model, condition, warranty, storage location, supplier, brand, expiry date (for stores that need it). Hidden fields are removed from forms, tables, print and reports; no data is deleted.
- **Optional spec fields per category** (for example Laptop: CPU, RAM, Storage, Screen) stored as small key/value data, shown in the product form and on price lists.
- **Wording:** a label map (Product ↔ Item, Customer ↔ Client, Sale ↔ Bill). App title and menu use the shop name, not "Laptop Inventory Manager".
- Urdu: label overrides apply to both languages.
- **Acceptance:** switching to *General store* hides serial/warranty/condition everywhere, uses "Item", and all existing data still opens; switching back restores the fields.

### F5 — Attention center, health and notifications  (M)

- Bell in the top bar with a count; items: backup overdue, customers overdue, low stock, negative cash/bank, task finished, WhatsApp disconnected, licence ending, update available. Each opens the filtered screen.
- **System health page:** last backup (local and cloud), database size, integrity check, WhatsApp link, free disk space, app version, last error. One-click "Create support report" (logs + health, no customer data) for the vendor.

### F6 — Control layer: undo and day lock (roles deferred)  (L)

- Keep the existing **Owner-only** login for the current offline, single-PC product. Staff roles are deferred unless the product scope changes.
- **Undo and Recycle bin:** deleted sales, payments, products and customers go to a bin for 30 days with restore; "Undo" toast for 10 seconds.
- **Day close and lock:** close the day after counting the drawer; entries before the lock date cannot be edited without the owner's super-password; every override is audited.
- Audit log filter by user, date and action.

### F7 — Import / Export engine  (M)

- Shared engine for CSV/Excel: download a **template**, upload, **preview** with row-by-row validation (missing category, bad number, duplicate serial), fix or skip, then run as a **task**.
- Writes an "errors" file for rows that failed so the owner can correct and re-import only those.
- Used by: products, customers (+ opening balances), suppliers, expenses; exports for every report.
- New dependency decision: an Excel library (for example `exceljs`) — needs approval (SPEC.md rule "ask first: new npm dependencies"). CSV-only works with no dependency and opens in Excel.

### F8 — Document engine  (M)

One branded look (logo, colours, footer, optional tax number) for: invoice, receipt, thermal 80 mm receipt, statement, quotation, warranty card, price list, reports. Built on `ReportTheme`. Urdu/RTL checked on every document. Shop logo is uploaded once in Settings.

### F9 — Quality gates (every phase)

- Tests first for logic (money, filters, ageing, jobs, import validation, backup).
- `npm test` green; manual run on the sample database (`seed-sample-data.js`).
- New IPC channel → listed in `guard.js` (login required; audited if it changes data; super-password if it exposes cost).
- New text → Urdu entry; `i18n.test.js` passes.
- Migrations numbered, with the automatic pre-migration backup.

---

## 5. Feature modules (what the client gets)

### A. Backup and data safety

| ID | Feature | Detail | Size |
|---|---|---|---|
| A1 | **Owner-connected Google Drive backup** | Owner signs in to their own Google account from Settings (installed-app OAuth; narrow `drive.file` scope). Upload runs as a `cloud` task after each successful local backup and daily while online. If offline, retain pending status and retry after reconnect. Keep last N in an app-owned "Backups" folder. Protect refresh token with Electron `safeStorage`. Status and disconnect/reconnect actions appear on Backup page and bell | L |
| A2 | Second location | Copy each backup to USB / network folder / OneDrive-Dropbox folder in addition to the default | S |
| A3 | Backup status | "Last backup: today 10:32 (local), yesterday (Google Drive)" on dashboard, Backup page and health page; warning after 2 days | S |
| A4 | Restore from cloud | List Drive backups, pick one, download as task, verify (existing `verify()`), safety copy, restore | M |
| A5 | Backup encryption | Optional password (AES-256-GCM, key from scrypt) for the cloud copy, because the file holds all balances. Password is not stored; lost password = unreadable backup, shown clearly in the setup text | M |
| A6 | Show auto-backups | Backup page lists the daily auto files too, with restore | S |
| A7 | Other clouds | OneDrive/Dropbox with the same interface — only if clients ask | M each |

Notes: Use the narrowest suitable Drive scope and verify Google's current consent requirements during implementation. The owner connects their own account; no shop backup should be stored in a shared vendor Drive. The OAuth client owner/configuration and recovery support still need a delivery decision. Zero-code fallback: set the Backup Folder to a Google Drive for Desktop folder.

### B. Customers and collections

| ID | Feature | Detail | Size |
|---|---|---|---|
| B1 | Customers list upgrade | Due column, last sale, last payment, sort by due, "Has due" filter, row actions (Reminder, Statement, New sale) | S |
| B2 | Ageing | Buckets 0–30 / 31–60 / 61–90 / 90+ days from the oldest unpaid sale; Ageing report and dashboard card | M |
| B3 | Promised payment | "Will pay on 2 Nov" note per customer or sale; overdue promises appear in the bell | S |
| B4 | Payment receipt | After every payment: receipt PDF (and thermal), optional auto-send on WhatsApp | S |
| B5 | Reminders | Template + one click for one or many customers who owe; runs as a `whatsapp` task; skips customers reminded in the last N days | M |
| B6 | Customer badges | "Pays on time / Slow / Overdue 60+" from payment history; shown on sale screen | S |
| B7 | Soft credit limit | Per customer; warns (does not block) on a new credit sale | S |
| B8 | Cheque register | Post-dated cheques common in wholesale: received cheque (bank, number, date, amount), status Pending / Cleared / Bounced; Cleared posts the payment, Bounced reverses it and notes the customer | M |
| B9 | Instalment plans | Schedule on a loan sale (for example 4 payments); "due this week" list; reminders | M |
| B10 | Customer import | Customers + opening balance from Excel/CSV (task) | S |

### C. Sales and documents

| ID | Feature | Detail | Size |
|---|---|---|---|
| C1 | Faster sale screen | Search by serial/barcode, remembers last price for this customer, shows customer's current due, hold and resume a sale, draft autosave after crash | M |
| C2 | Below-cost warning | Warns when price is under cost **without showing the cost** (cost stays hidden) | S |
| C3 | Price tiers | Retail / Wholesale / Dealer prices on products; customer default tier fills the price | M |
| C4 | Quotation | Create a quote PDF, convert to sale in one click, expire date | M |
| C5 | Documents | Logo, terms line, payment QR (EasyPaisa/bank from Settings), "Paid / Balance due" stamp, optional NTN/tax number, A4 and 80 mm thermal | M |
| C6 | Warranty card | On sale of a serial-numbered item: PDF with serial, date, warranty expiry; send with invoice | S |
| C7 | Salesperson | Optional "sold by" on each sale for later commission reports | S |

### D. Products and inventory

| ID | Feature | Detail | Size |
|---|---|---|---|
| D1 | **Bulk product add** | (a) Excel/CSV import with template, preview, validation, duplicate-serial check, runs as a task, errors file. (b) "Quick add many" grid for typing 10–50 rows at once with copy-down. (c) "Duplicate this product" button | L |
| D2 | **Bulk edit** | Select rows → change category, supplier, location, status, or price by % / amount; runs as a task; audited; super-password if it touches cost | M |
| D3 | Categories managed | From F3: categories list, merge typos, optional spec fields per category | (F3) |
| D4 | Low-stock level | Minimum per category or product; dashboard card; reorder list grouped by supplier | M |
| D5 | Serial lookup | Search a serial: shows current stock or who bought it, when, warranty left | S |
| D6 | Structured warranty | Months + start date → expiry; "warranties ending this month" list | M |
| D7 | Barcode / labels | Code128/QR labels (name, price, serial) for a sheet or label printer; any USB scanner works as keyboard input in search | M |
| D8 | Stock count | Count shelf, compare with system, post adjustments with reason (audited) | M |
| D9 | Photos | One or more photos per product, stored beside the database | M |
| D10 | Dead stock | Items not sold in N days, with money tied up (cost hidden unless unlocked) | S |
| D11 | Purchase price history | Cost per purchase over time, visible only after super-password | S |
| D12 | Units | pcs/box/meter/kg with decimals for non-electronics shops (from F3) | M |

### E. Suppliers and purchasing

- E1 Bill due dates and "payments due this week" list (S)
- E2 Reorder list per supplier from low-stock levels; one-click WhatsApp order message (M)
- E3 Purchase order document and receive-into-stock (M)
- E4 Supplier ageing report (S)
- E5 Supplier import (S)

### F. Money

| ID | Feature | Size |
|---|---|---|
| F-1 | **Expense categories managed** (from F3), recurring expenses (rent, salaries suggested each month), receipt photo | M |
| F-2 | Payment accounts: split cash book by account (Meezan, EasyPaisa, JazzCash) | M |
| F-3 | **Daily closing:** expected cash vs counted, difference recorded, ties to day lock (F6) | M |
| F-4 | Return adjustment: reduce the original sale and the customer's receivable; no cash/bank payout workflow. Carry forward any return amount beyond outstanding due as customer credit, with clear statement display | M |
| F-5 | Opening balances wizard (cash, bank, customers, suppliers, stock) | M |

### G. Reports and analytics

- G1 Excel/CSV/PDF export on every report (M)
- G2 Profit by product, category, customer, month — super-password protected (M)
- G3 Top customers, top products, slow movers (S)
- G4 Month-end pack: sales, collected, expenses, profit, dues, stock value, as one PDF, runs as a task, can go to the owner's WhatsApp (M)
- G5 Dashboard: "Needs attention" strip, top debtors, today vs yesterday, sales trend chart (M)
- G6 Tax summary (sales tax collected) if the shop uses it — optional per business profile (M)

### H. Messaging

- H1 Template manager: English/Urdu templates with placeholders (`{customer}`, `{due}`, `{shop}`) in Lists & Setup (S)
- H2 Reminders and receipts (B4, B5) use templates
- H3 Scheduled messages — deferred. The owner starts every sending task (decision 8); unattended campaigns wait until clients ask.
- H4 Owner summary: a "Send me today's summary" button that sends to the owner's own number; the owner clicks it (S)
- H5 Price list to customers: in-stock items with the customer's tier price, PDF, sent as a task (M)
- H6 Risk control: WhatsApp sending uses the unofficial WhatsApp Web protocol. Keep the pacing, the daily cap setting, and the manual one-by-one fallback; show a plain warning in Settings. SMS gateway or email as another channel — only if clients ask (L)

### I. Optional modules for dealers (turned on by business profile)

- I1 **Service / repair jobs:** job number, customer, item, fault, status Received → Repairing → Ready → Delivered, charge, parts used from stock, message when ready (L)
- I2 **Trade-in / buy-back:** buy a used item from a customer, add to stock with condition, optionally set the amount against what the customer owes (M)
- I3 Warranty claims linked to serial number (M)

### J. Team and security

- J2 Auto-lock after idle · J3 Owner password reset via vendor console · J4 Audit log filters · J5 Hide cash/bank and profit behind super-password (done today for cash/bank cards; extend to Cash Book page and reports). Staff roles are deferred; owner remains the sole role.

### K. Platform and ease of use

- K1 **First-run wizard:** shop name, logo, business type, currency, opening balances, passwords, backup location, optional Google Drive link (M)
- K2 **Global search (Ctrl+K):** customer, product, serial, invoice (M)
- K3 Keyboard shortcuts (new sale, add payment, search) and tooltips (S)
- K4 In-app help per page: 3-line "what is this", short guided tour on first use (M)
- K5 **Auto-update** with automatic pre-migration backup (M)
- K6 Licence / subscription expiry notices from the vendor console (M)
- K7 Larger-text and "big numbers" display setting (S)
- K8 Helpful empty states with a next-step button (S)
- K9 Support report export (in F5)
- K10 Installer checks: Windows version, writable data folder, antivirus note (S)

### L. Later (only if clients ask)

Owner phone view (read-only dashboard) · multi-PC or branch sync · online payments · e-invoice integration · barcode scanner hardware profiles · customer self-service statement link.

---

## 6. Roadmap

| Phase | Name | Contents | Depends on | Size |
|---|---|---|---|---|
| 0 | Smart defaults | F1, B1, customer report fix, print layout rules | — | M |
| 1 | Task Center | F2; move bulk WhatsApp into it | — | L |
| 2 | Lists & Business profile | F3, F4; product and expense categories managed; wording | 0 | L |
| 3 | Bulk product tools | F7 engine, D1, D2, customer/supplier import (B10, E5) | 1, 2 | L |
| 4 | Cloud backup | A1–A6, status on dashboard | 1 | L |
| 5 | Collections and messaging | B2–B7, H1–H2, B4 receipts, F5 bell | 1, 0 | L |
| 6 | Inventory pro | D4–D12, E1–E4 | 2, 3 | L |
| 7 | Closing and reports | F-1 to F-5, G1–G5, F8 documents | 2 | L |
| 8 | Sales speed and documents | C1–C7, B8 cheques, B9 instalments | 5, 7 | L |
| 9 | Owner controls | F6, J2–J5 | 0 | M |
| 10 | Dealer modules | I1–I3, H4–H5 | 5, 6 | L |
| 11 | Platform polish | K1–K10 | all | L |
| T | Tech health (runs alongside 0 and 1) | Keep Electron current; check contextIsolation, sandbox and CSP; add CI; modernise screens gradually (small build step and a light UI library for new screens only); type-check services and IPC file by file | — | M |
| 12 | Later | section L | — | — |

**Order logic.** Phase 0 fixes what the client asked for first. Phase 1 is the engine that phases 3, 4 and 5 sit on. Phase 2 makes the system adaptable and gives bulk import real categories to land in. Phases 3 and 4 can swap if a client is worried about data loss more than about typing stock; Drive backup then runs first and shows its status in a simple banner until the Task Center is ready.

**Exit check for every phase:** acceptance tests green, full `npm test` green, run on a copy of the sample data, Urdu check, short note in the change list.

---

## 7. Data model changes (summary)

New tables (each added by a numbered migration with the automatic pre-migration backup):

| Table | Phase | Purpose |
|---|---|---|
| `jobs`, `job_items` | 1 | Task Center queue and per-item results |
| `lists`, `list_items` | 2 | Master data (categories, expense categories, units, accounts, tiers, tags); `usage` is counted live |
| `settings` keys: `business_type`, `field_switches`, `labels`, `last_backup_*` | 2, 4 | Business profile and status |
| `product_specs` | 2 | Optional spec key/values per product |
| `product_photos` | 6 | Photo file names |
| `payment_promises`, `cheques`, `instalments` | 5, 8 | Collections |
| `templates` | 5 | Message templates |
| `day_locks`, `recycle_bin` | 9 | Owner control layer; no staff roles |
| `service_jobs`, `trade_ins` | 10 | Dealer modules |
| `scheduled_tasks` | 10 | Scheduled messages |

Changes to existing tables: `products.category/unit/min_stock/warranty_months`, relaxed `CHECK`s on condition and payment method (phase 2, rebuild migration), `customers.price_tier/credit_limit`, `sale_issues.sold_by/due_date`. Every change keeps old data and is tested on a copy of the live database.

---

## 8. Risks

| Risk | Plan |
|---|---|
| Freezing the window during imports (synchronous SQLite) | Chunked transactions with yields, worker thread if needed; test with a 5,000-row import |
| Table rebuild migration for relaxed `CHECK`s | One migration, pre-migration backup, tested on a copy with the sample data |
| WhatsApp number restriction | Keep pacing and caps, warn the client, keep manual fallback |
| Google OAuth consent and account recovery | Owner connects their own Drive account; document who owns/configures OAuth client, how revoked consent is recovered, and offer a local folder fallback |
| Lost backup password (A5) | Optional, clear warning, never stored |
| Scope growth | Each phase is its own spec; nothing starts without an approved spec |
| New dependencies (Excel library, Google SDK) | CSV first; plain `fetch` for Google; ask before adding any package |

---

## 9. Decisions needed from you

1. **Order:** 0 smart defaults, 1 Task Center, 2 Lists & Business profile, 3 bulk product tools, 4 Google Drive backup. Drive can move earlier if clients worry more about data loss.
2. **Google Drive:** owner connects their own account in the app; the app uploads database backups to that owner's Drive automatically when online. No shared vendor Drive.
3. **Import:** support spreadsheet-based workflows; decide CSV-first vs `.xlsx` based on client need. Both require preview, validation, duplicate policy, and errors output.
4. **Business types:** which presets should ship first besides laptop dealer (mobile shop, general store, others)?
5. **Payment accounts:** keep Cash/Bank as the base and add account names (recommended), or fully free account types (bigger rebuild)?
6. **Staff:** one Owner role only for current offline single-PC scope; staff roles are deferred.
7. **Returns and cash:** returns reduce sale/customer receivable; no cash payout feature. Define carry-forward customer credit when return value exceeds outstanding due.
8. **WhatsApp:** the owner starts each sending task and confirms recipients/content; unattended scheduled campaigns are deferred.
9. **Credit-balance customers** (shop owes them): shown in the default customer report? (this plan: yes)
10. **Tax:** do clients need a tax number/summary on invoices?

---

## 10. How each phase is delivered

Per phase: spec with acceptance criteria → task list in small slices → tests first for logic → build → `npm test` green → run on the seeded sample database → Urdu check → commit. The first phase to start, once you approve, is **Phase 0**.
