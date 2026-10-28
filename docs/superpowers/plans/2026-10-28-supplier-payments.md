# Supplier Payments & Cash/Bank Book: Plan

Status: DRAFT for owner/client review. Written 2026-10-28. No code written yet.

## Goal

The shop owner pays suppliers from the shop's cash or bank money. Every payment must reduce the cash-in-hand or bank balance, the owner must always see how much is still owed to each supplier, and every rupee in and out of cash and bank must be reviewable line by line.

## What exists today

- **Suppliers do not exist as records.** Each product has a free-text `supplier` column (`products.supplier`). There is no supplier list, no supplier balance, and no way to record "I paid supplier X".
- **Cash and bank balances** are computed on the fly in `dashboardService.getBalances()`:
  `cash = opening_cash + customer payments received in cash - expenses paid from cash` (same for bank). There is no stored balance to drift out of sync, which is good and must stay that way.
- **Expenses** (`expenseService`, table `expenses`) already take "paid from Cash or Bank". Supplier payments must follow the same pattern.
- **Customer ledger** (`customer_ledger`) is the model to mirror for a supplier ledger.
- **Safety nets we can reuse:** numbered migrations with a pre-migration backup, `auditService` + `AUDITED` list in `src/ipc/guard.js`, `requireSuper` (super-password) for edit/delete, `integrityService` data check, `BulkShare` + `ShopInfo` for WhatsApp/print.

## How a real dealer's money flows

1. Dealer buys laptops from a supplier. Usually **not paid in full on the day**: part now, rest later ("udhaar"), so the supplier is owed money.
2. Dealer pays the supplier in **instalments**, sometimes cash, sometimes bank/EasyPaisa transfer. Each payment must leave cash or bank the same day.
3. Supplier balance at any time = **opening balance + purchases - payments - returns**. The owner and the supplier compare this number.
4. Sometimes goods go back to the supplier (defective), reducing what is owed.
5. Owner deposits cash into the bank, or withdraws from the bank. If the app cannot record this, cash and bank drift away from reality.
6. The owner wants one place to review **every movement** of cash and bank, with a running balance, and to find a mistake from a bad entry.

## Design

### 1. Data (migration `006-suppliers`)

| Table | Purpose | Key columns |
|---|---|---|
| `suppliers` | The supplier list | `id`, `name` (unique), `phone`, `phone2`, `address`, `notes`, `status` Active/Inactive |
| `supplier_ledger` | Every change in what we owe | `id`, `supplier_id`, `entry_date`, `entry_type` (`Opening`, `Purchase`, `Payment`, `Return`, `Adjustment`), `charge` (we owe more), `paid` (we owe less), `payment_source` Cash/Bank (Payment only), `reference_no`, `note`, `created_at` |
| `cash_bank_moves` (phase 3) | Money moved between cash and bank, or owner put in/took out money | `id`, `move_date`, `kind` (`CashToBank`, `BankToCash`, `OwnerIn`, `OwnerOut`), `account` / `amount`, `note` |

- Supplier balance = `SUM(charge) - SUM(paid)` from `supplier_ledger`. **The ledger is the single source of truth**, exactly like the customer ledger. No balance column is stored.
- `products.supplier_id` (nullable) is added next to the existing text column. The migration creates a `suppliers` row for every distinct existing supplier text and links the products. Old text stays, so nothing is lost and nothing breaks.
- A `CHECK(amount > 0)` on each amount, `roundMoney()` on every calculation, same as expenses.
- **Existing stock is not turned into payables.** Old purchases are assumed paid. If the shop still owes a supplier for old stock, the owner enters it once as the supplier's **Opening balance**.

### 2. The rule that keeps the money right

```
cashInHand  = opening_cash + customer receipts (cash) - expenses (cash) - supplier payments (cash)  +/- moves
bankBalance = opening_bank + customer receipts (bank) - expenses (bank) - supplier payments (bank)  +/- moves
```

- Done in one place: `dashboardService.getBalances()` and the date-range cash/bank figures read supplier payments the same way they read expenses.
- **A supplier payment is NOT an expense and must not reduce profit.** The cost of laptops already reaches profit through cost of goods sold (`getCogs`). Counting the payment as well would subtract the same cost twice. It only moves cash/bank down and the supplier balance down. The dashboard shows it on its own line ("Paid to suppliers"), like the Old Balances card is kept separate from profit.
- A **purchase on credit** changes only the supplier balance (we owe more). It does not touch cash/bank until a payment is made.
- Customer refunds are not part of this plan (existing behavior unchanged).

### 3. Screens

- **Suppliers page** (new sidebar item): list with name, phone, address, **balance we owe**, total purchased, total paid; search; add/edit; WhatsApp/bulk not needed.
- **Supplier detail / statement:** every ledger row with running balance, filter by date, **Print** and **WhatsApp** (reuse `ShopInfo` header and `BulkShare` queue so the owner can send "your payment received" statements; supplier-side payment details can come later).
- **Pay Supplier form** (from the list or the statement): supplier, date, amount, **Paid from: Cash / Bank**, reference (cheque/transaction no.), note. It shows the current cash or bank balance and the supplier balance before and after.
- **Add Purchase / Bill form:** supplier, date, bill total, optional "paid now" amount + source, reference, note. The unpaid part becomes payable.
- **Dashboard:** cash and bank cards get a "Paid to suppliers" line; new **Payable to suppliers** card (separate from profit, like Old Balances).
- **Cash & Bank Book** (new report): one table of every movement in date order, **Opening, customer receipt, expense, supplier payment, transfer**, each with source (Cash/Bank), who/what it was for, and the running cash and bank balance. Filter by date and by Cash/Bank; Print with the shop header. This is the "review every detail" screen the client asked for.

### 4. Safety rules (real-business behavior)

- **Cannot pay more than the account holds.** If the payment would make cash or bank negative, the form blocks it with the message "Cash in hand is Rs X. Add your opening balance in Settings or record a bank deposit first." This stops typing errors. (Question 1 asks whether the owner wants an override.)
- Paying more than the supplier balance is allowed only as an explicit "advance" confirmation (shows a negative balance = supplier owes us).
- **Edit and delete a payment/purchase need the super-password** (`requireSuper`), and are written to the audit log (add `supplier:*` channels to `AUDITED`). Deleting a payment returns the money to cash/bank automatically because balances are computed, not stored.
- Dates cannot be in the future by more than the existing app allows; amount must be > 0; supplier must exist and be Active to take new entries.
- Integrity check (`integrityService`) gets two new checks: supplier balances equal the ledger sums, and cash/bank are not negative today.
- Backup/restore already copies the whole DB, so the new tables are covered. Migration 006 runs through the existing backup-before-migrate path.

## Phases

Each phase leaves the app working and testable.

**Phase 1: Suppliers + payments that reduce cash/bank (the core ask)**
1. Migration `006-suppliers` (tables, `products.supplier_id`, backfill from existing text, tests on a copy of the live-shaped DB).
2. `supplierService`: add/edit/list, `addOpening`, `addPurchase`, `addPayment`, `statement`, `balance`; negative-cash guard; unit tests for each rule (payment reduces the right account, delete restores it, over-payment blocked, rounding).
3. `dashboardService.getBalances()` and range cash/bank include supplier payments; profit untouched (test proves a payment does not change profit).
4. IPC channels + preload + guard/audit entries.
5. Suppliers page, Supplier statement, Pay Supplier form, Add Purchase form, sidebar entry, Urdu strings.
6. Dashboard: "Paid to suppliers" line and "Payable to suppliers" card.

**Phase 2: Review and reporting**
7. Cash & Bank Book report with running balances (and print).
8. Supplier statement print + WhatsApp (shop header via `ShopInfo`).
9. Integrity checks for supplier balances and negative cash/bank.

**Phase 3: Complete the real-world edge cases** (only if the client confirms in Questions 2 and 3)
10. Cash to Bank / Bank to Cash transfers, owner puts in / takes out money (`cash_bank_moves`), included in the Book and the balances.
11. Return goods to supplier (reduces payable and removes stock).
12. Optional link from "add product" to a supplier bill so stock entry and payable are one step.

## Worked example (acceptance check)

Opening cash 200,000; opening bank 100,000. Supplier "Ali Traders" opening payable 50,000.
- Buy laptops, bill 500,000, "paid now" 200,000 from bank: **blocked**, because the bank only holds 100,000. Owner enters "paid now" 100,000 from bank instead. Payable = 50,000 + 500,000 - 100,000 = **450,000**, Bank = **0**.
- Next week pays 150,000 cash. Payable **300,000**, Cash **50,000**.
- Delete the 150,000 payment by mistake-correction (super-password): Payable **450,000**, Cash **200,000**; the audit log shows who/what/when.
- Profit for the period is unchanged by any of these payments.

## Open questions for the client

1. **Overdraw:** if a payment is bigger than the cash/bank balance, should the app **block** it (recommended: protects from typos) or only **warn** and allow? (Shops that never entered an opening balance will hit the block, so we point them to Settings.)
2. **Do suppliers sell on credit with instalments?** If yes (common), the Purchase/bill form and payable balance are essential. If everything is paid on the spot, Phase 1 can be simpler.
3. **Do you deposit cash into the bank / withdraw, or put in/take out personal money?** If yes, Phase 3 item 10 is needed or cash and bank will not match reality.
4. **Do you return defective goods to suppliers?** Decides whether Phase 3 item 11 is needed.
5. **Do you want to record what you bought (which laptops) on each supplier bill**, or only the bill total? Bill total only is quick; item-level ties into inventory and is a bigger change.
6. **Existing suppliers:** the app will create supplier records from the names already typed on products. After that we need the opening amount owed (if any) per supplier, typed in once.

## Out of scope

Multiple users or permissions, supplier invoices as PDF, taxes/GST, cheque clearing status, multi-currency, syncing between PCs, and any change to how customer refunds affect cash.
