# Client Service Roadmap — Shop Manager

**Status:** Owner review draft — updated with owner decisions  
**Prepared:** 2026-10-28  
**Scope:** A practical product plan for improving the existing offline Windows shop manager. This document is planning only; no application features are implemented by it.

## Executive recommendation

Build in this order: **trustworthy numbers and daily workflows → configurable catalog and bulk tools → background Task Center and owner-connected Drive backup → collections and operational reporting → optional trade-specific modules.** The product remains a single-PC, offline-first app with one owner login. Internet-dependent work waits safely until a connection is available.

The existing [`master-plan.md`](master-plan.md) is the detailed feature inventory. This document is the decision-oriented version: it identifies what to ship first, how the pieces should work together, and which choices need the owner's input before implementation.

## Product outcome

The shop owner should be able to answer these questions quickly and confidently:

1. What needs attention today: unpaid customers, low stock, failed backup, a task needing a retry?
2. What stock do I really have, where is it, and what is available to sell?
3. What did this customer buy, pay, return, and still owe?
4. Can I safely update many products or restore my business data without blocking or losing work?
5. Can I print or share clear, accurate records in English or Urdu?

## What the project already has

The app is an Electron + SQLite, Windows-first, offline system with sales, customers, payments and ledgers, suppliers, expenses, returns, damage records, reports, daily local backups, verified restore, audit logging, and WhatsApp integration. It already supports English and Urdu. The goal is to connect and improve these capabilities, not replace them.

## Visual direction from the supplied reference

Use the supplied store-admin screenshot as the visual direction for a more polished, attractive interface: a calm, light workspace; clear left navigation; a top bar with global search, notifications, and owner identity; a page title with a short explanation and clear primary actions; compact summary cards; readable search/filter controls; and a clean data table. When rows are selected, show a contextual bulk-action bar with the selected count and relevant actions. Adapt these patterns to the inventory business and existing app workflows; do not copy unrelated e-commerce concepts such as online storefronts or marketing channels.

The app already has light/dark theme choices and English/Urdu language switching with RTL direction support. The plan is to make those features consistent and polished across every page, modal, notification, table, task state, form, and print/share flow—not to treat the screenshot's light theme as the only supported mode. Keep the owner's selected theme and language across launches.

**UI acceptance:** the same page is usable in light and dark themes; Urdu lays out right-to-left with sensible sidebar, table, icon, and action placement; switching language/theme does not lose form data or current selection; text remains readable at normal Windows scaling and narrow window widths; status is conveyed with text/icon as well as color.

The existing draft roadmap correctly identifies the requested features:

- **Top-right Task Center** for long-running WhatsApp, import, export, and backup work.
- **Bulk product add and edit**, including validation, preview, and an error report.
- **Managed categories and setup lists**, replacing scattered free-text and hardcoded choices.
- **Google Drive backup**, with status, retry, restore, and verification.

The owner has confirmed these product rules for this roadmap:

- There is one login role: **Owner**. This is a local/offline product, not a multi-user cloud service.
- The owner connects their own Google account from the app. The app automatically uploads local database backups to that owner's Drive; no vendor-owned Drive account is used for customer data.
- A product return reduces the original sale and the amount owed by that customer. There is no cash/bank “pay customer” feature. If a return exceeds the remaining due, preserve the extra as a customer credit for future transactions, pending a precise display/accounting rule; do not record a cash payout that never happened.
- Payment types keep their accounting meaning, while the owner can add named accounts such as Meezan, UBL, or another bank/wallet and its account/reference number.
- The owner already uses Baileys to link WhatsApp. The app should retain the linked session and reconnect; repeated QR linking is a bug to investigate and fix.

**Current selection audit:** the Customers page has row checkboxes and a bulk WhatsApp flow; Sales History also contains a bulk share flow. Other reviewed lists (inventory, suppliers, ledgers, returns, and expenses) do not yet use the same reusable selection/action toolbar. The existing WhatsApp batch currently runs inside a renderer modal, so it does not yet meet the desired persistent top-right background queue behavior.

## Recommended delivery plan

Effort estimates are relative (S: a few days, M: about a week, L: multiple weeks); each phase should be separately scoped against the actual code before implementation.

### Phase 0 — Make today's numbers and common tasks dependable

**Client value:** The owner can trust balances and find urgent work without digging through reports.

- Fix customer due filtering, sorting, and customer report/print behavior.
- Add customer due to the list and direct actions for statement, reminder, and new sale.
- Establish shared calculation rules for sale totals, payments, returns, damage, available stock, and outstanding balances.
- Reconcile dashboard, reports, customer statements, and ledgers against the same business data.
- Clarify the distinction between on-hand, reserved, damaged, and available quantity. Damaged units must not be sellable.
- Improve the dashboard's attention area with low stock, overdue balances, and local backup status.
- Refresh the app shell and high-use pages toward the supplied reference: consistent spacing, typography, restrained accent color, useful summary cards, clean table density, clear page actions, and contextual selection toolbar.
- Audit light/dark styling and English/Urdu coverage across all existing pages; fix visual regressions, incomplete translations, clipped labels, and RTL alignment problems as these workflows are upgraded.

**Done when:** seeded scenarios reconcile across dashboard, reports, ledger, and statement; zero-due customers can be included explicitly; damaged items never appear as available-to-sell.

### Phase 1 — Selection actions, safe catalog setup, and product maintenance

**Client value:** The owner can keep product data tidy and maintain the catalog in batches.

- Manage categories, expense categories, units, storage locations, brands, and payment account names in one Settings area.
- Seed existing values into the new lists; provide rename, merge, archive, usage counts, and duplicate cleanup.
- Add product import from CSV first: downloadable template, preview, row-level validation, duplicate serial checks, and a downloadable errors file.
- Add bulk edit for category, supplier, location, status, and sale price; show a before/after preview and require confirmation.
- Add a quick-add grid and duplicate-product action for repeated stock entry.
- Record stock adjustments with a reason and audit trail; make a stock count workflow a follow-on if needed.
- Generalize the existing table checkboxes into a shared selection/action pattern used across modules. Clearly distinguish **select this page** from **select all filtered results**, preserve selection when paging, and show the selection count and applicable actions.
- Start with module actions listed below; selection must never silently turn a displayed-page action into an all-record action.

**Done when:** imported rows cannot silently overwrite existing stock; invalid rows are clearly reported; bulk changes can be reviewed before commit and are auditable; legacy category values remain visible until intentionally merged or archived.

#### Bulk action map

| Module | Useful selected actions | Guardrails |
|---|---|---|
| Customers | Print/export selected statements; WhatsApp statements or reminders; mark active/inactive; export contact list | Preview recipient count and message; skip missing/invalid numbers; never send without owner starting the task |
| Customer ledgers | Print/export selected customer statements; share statements for selected customers; export ledger rows by filter/date | Treat a statement as a customer-level document; do not bulk edit/delete financial entries |
| Products / inventory | Assign category, supplier, storage location, condition/status; apply price increase/decrease by amount or percentage; export; print barcode/price labels; archive | Preview exact matched rows and old/new values; cost changes require current super-password; stock quantity changes use audited adjustment reasons, never a generic edit |
| Suppliers | Export selected suppliers; prepare supplier balance statements; mark active/inactive; prepare reorder list / draft order | Do not send an order or record payment automatically; owner reviews and confirms |
| Sales / sales history | Print/export invoices; share invoice copies; export filtered sales | No bulk mutation of paid sales; corrections remain per-sale audited workflows |
| Returns and damage records | Export/print filtered records; open related sale/product/customer | No bulk correction, restore, or disposal; each stock-affecting correction needs item-level review and reason |
| Expenses / cash book | Export filtered records; print period summaries | No bulk delete/edit of posted money movements |

Actions that take more than a short interaction, including large exports and multi-recipient sharing, should become Task Center jobs. Quick in-memory UI operations can remain immediate.

### Phase 2 — Task Center and non-blocking work

**Client value:** The owner can keep using the app while large jobs run and can recover from interruption.

- Add a persistent Task Center indicator in the **top-right** with running, queued, complete, failed, and interrupted counts.
- Show task progress, current item, success/failure totals, stop, retry-failed, and resume where safe.
- Move bulk WhatsApp sending into the queue while preserving pacing and the existing manual fallback.
- From the owner’s perspective: select records, choose an action, confirm the exact target count/content, then leave the page; the top-right queue continues and reports sent, skipped, failed, and pending records.
- Run catalog import/edit, large exports, local backup verification, and cloud transfer as background tasks.
- Keep a bounded history of task outcomes and failed item details; moving between screens must not cancel a job.
- Chunk database work so SQLite activity does not freeze the UI; use a worker only if measured responsiveness requires it.

**Done when:** tasks survive page navigation and an app restart is reported accurately; one failed item can be retried without repeating successful sends or edits; independent work lanes can proceed without blocking each other.

### Phase 3 — Owner-connected Google Drive backup and restore confidence

**Client value:** A PC failure does not mean losing the shop's records.

- First improve the Backup page to show daily automatic backups, timestamps, verification results, and the last successful backup.
- Add a **Connect Google Drive** setup in the owner's Settings/Backup page. OAuth consent is granted by the shop owner to their own Google account; tokens are protected using the Windows secure-storage facility.
- After each successful local automatic backup, enqueue its cloud upload. If offline, keep it pending and retry with backoff when online; show last successful local and Drive backup separately.
- Use the narrowest suitable Drive authorization, an app-owned backup folder, clear retention controls, and an owner-visible disconnect/reconnect action.
- Add a local second-copy option (USB or a user-selected synced folder) as a fallback for owners who do not want Drive.
- Show cloud connection and last-upload status; retry failed uploads; alert when local or cloud backup is overdue.
- Restore flow: choose a backup, verify it, make a safety copy of the current database, then restore and report the result.
- Document account ownership, revoked/expired authorization, retention, and what happens when the app is offline. Do not claim the app can upload while the PC is off.

**Done when:** the user can see whether a usable copy exists away from the PC; a corrupted or incomplete backup is refused; restoring never overwrites the current database without first preserving it.

### Phase 4 — Collections, customer service, and useful documents

**Client value:** The owner knows who owes money, follows up consistently, and gives customers clear records.

- Add due dates, ageing buckets, promised payment dates, and overdue indicators.
- Add customer credit-limit warnings and payment history summaries.
- Provide payment receipts and reusable English/Urdu statement and reminder templates.
- Make customer profiles a single entry point to sales, payments, returns, damage events relevant to that customer, and statements.
- Add quotations that can convert to sales, and branded invoice/receipt layouts with a logo and shop details.
- Keep WhatsApp sending transparent: show exactly what will be sent, preserve manual confirmation options, and provide an outcome log.

**Done when:** statement balances match the ledger; reminders default to customers with a genuine due balance; return/damage details appear on statements only when they changed the customer's transaction.

### Phase 5 — Operational stock and financial control

**Client value:** The owner can reorder in time and close a day with confidence.

- Add per-product minimum stock, reorder list grouped by supplier, and dead-stock view.
- Add barcode/serial lookup and simple label printing where the client's workflow needs it.
- Add supplier bill due dates and supplier ageing.
- Add daily cash close: expected versus counted, difference reason, and a printable close summary.
- Add exportable reports and a month-end summary with sales, returns, collections, expenses, dues, and stock valuation.
- Show gross profit only under the existing protected-cost rules, and define the valuation basis explicitly.

**Done when:** low-stock recommendations use sellable stock; cash close ties to recorded cash transactions; report filters and totals are consistent with source ledgers.

### Phase 6 — Optional business expansion

**Client value:** The product can serve more shops without burdening the base workflow.

- Business profile presets and configurable labels/fields (laptop/mobile/electronics/general store).
- Optional repair/service jobs, trade-ins, and warranty claims for dealers.
- Keep the single Owner role. Revisit multi-user roles only if the product changes from the owner's single-PC workflow.
- Scheduled messages, richer price tiers, and additional cloud providers only when customers ask for them.
- Multi-PC/branch sync, mobile companion, online payments, and tax/e-invoice integrations remain later projects because they change the product's security and operating model substantially.

## Cross-cutting requirements

- Preserve current records and workflows; every schema change needs a numbered, recoverable migration and a pre-change backup.
- Use the existing SQLite/services/IPC/renderer structure. Validate sensitive actions and inputs in the main process, not only in the UI.
- Keep cost/profit data protected by current super-password rules; bulk edits affecting cost need explicit protection and audit detail.
- Every new action that changes business data should be attributable in the audit log and safely recoverable where practical.
- All new UI strings need English and Urdu; print and PDF output must be checked for RTL layout.
- Long jobs need progress, failure detail, retry behavior, and a clear success result.
- Provide useful empty, loading, and error states. Use templates and previews for bulk or irreversible changes.
- Follow the supplied screenshot's modern admin visual language: persistent navigation, global search, clear page hierarchy, compact useful metrics, strong table/filter controls, and contextual bulk actions. Keep it cohesive with this app's offline shop workflows.
- Maintain fully usable **Light** and **Dark** themes and **English** and **Urdu** language modes throughout the product. Urdu must use RTL layout; mixed-direction phone numbers, currency, serial numbers, and references must remain readable. Persist both preferences across restarts.
- Check keyboard focus, contrast, readable text, useful icon labels, and responsive behavior at common laptop window sizes. Do not rely on color alone for stock/payment/task status.
- Prefer CSV first for imports/exports; choose `.xlsx` only when there is a demonstrated need and after dependency approval.

## Decisions and conflicts to resolve before implementation

The owner has now resolved several questions from the broad roadmap. The older [`SPEC.md`](../SPEC.md) still has superseded assumptions; update it in the phase-specific implementation brief before changing code. Remaining details to settle are:

1. **Return overpayment:** record a carry-forward customer credit when return value exceeds amount due; confirm labels and whether it can offset future invoices. There is no cash payout path.
2. **Drive OAuth application:** owner authorizes their account; decide who owns/configures the OAuth client and handles Google verification/consent-screen support. Do not share a vendor Drive account across shops.
3. **Import formats:** design a common preview/validation workflow for CSV and Excel. CSV can be first; add `.xlsx` support if real clients need it. Both must have templates, explicit create-vs-update mode, stable identifiers, duplicate policy, and row-level errors.
4. **Named payment accounts:** determine account fields (display name, account/reference number, account type Cash/Bank/Wallet, active state) and whether a number should appear on customer documents. Never expose full account numbers in ordinary reports unless needed.
5. **Tax and currency:** confirm whether target shops need tax numbers/summary, multiple currencies, or only the current local currency before document design.

## Explicitly keep out of the first release

Avoid starting with multi-branch synchronization, a mobile app, broad pharmacy/expiry workflows, automatic recurring messages, and a full purchase-order system. They add migration, support, and operational complexity before the core shop loop is dependable. Capture client demand and revisit after observing real usage.

## Suggested first implementation brief

Start with **Phase 0**, then scope Phase 1 as the first substantial client-visible upgrade. Before coding, first resolve the return credit carry-forward rule and inspect why the WhatsApp session asks for a new QR on subsequent use. Prepare phase specs from the actual schema, selection/pagination behavior, category migration rules, import columns and duplicate handling, preview UX, owner-only permissions, and acceptance examples. Do not implement the entire roadmap as one change.

### Phase 1 acceptance examples

- Import 100 valid products and 5 invalid rows: the valid rows are committed once, invalid rows are downloadable with reasons, and retrying the error file does not duplicate successful products.
- Select 20 products and change category: a preview shows exactly those 20 and their old/new category; cancel changes nothing; confirm writes an audit entry.
- Merge a misspelled category: existing products and reports resolve to the destination category; the old label no longer appears as a new-entry option.
- Close/reopen the app during an import: the task outcome is explicit and the database contains no half-imported transaction.
- Select customers across multiple pages: the selected total is clear, deselection works, and the task records each delivered/skipped/failed result.
- Bulk product price change: the preview shows each old and new price and the formula; cancel makes no change; confirmation audits the batch.
- Core dashboard and inventory pages match the new visual system in both themes and both languages; Urdu RTL does not clip table actions, navigation, or numeric identifiers.

## WhatsApp persistent-link repair brief

The current code stores Baileys multi-file credentials under the app user-data folder and attempts a quiet reconnect at startup. The UI has separate Link, Reconnect, Change number, and Unlink controls. If the owner is repeatedly asked to scan, investigate the actual connection lifecycle before changing implementation:

1. Confirm the session directory is stable across packaged/dev launches and Windows user accounts, writable, and excluded from cleanup/reset paths.
2. Log state transitions and Baileys disconnect reason codes without logging QR payloads, tokens, or message contents.
3. Distinguish: credentials absent (show Link/QR), saved credentials reconnecting (show Reconnecting), linked (show Connected), revoked/logged out (ask to Link again), and transient network/service error (retry saved session, no new QR).
4. Make `connect` idempotent so rapid clicks cannot start duplicate sockets; ensure a still-valid saved session never invokes QR pairing unless the phone revoked it or the owner chose Change number.
5. Test link → close app normally → reopen → reconnect without QR; temporary offline → online reconnect; phone-side unlink → explicit relink; repeated Link clicks → one socket; change number → old session cleared then one new QR.

Do not state that Baileys is an official WhatsApp integration or guarantee delivery. Keep the manual/share fallback and make queued recipients and outcomes visible.

## Professional workflow references

This roadmap uses common patterns documented by established inventory tools: selection-aware bulk editors, spreadsheet import/update using stable identifiers, and stock-level alerts. The point is to adopt the useful workflow patterns while keeping this product offline-first and owner-operated:

- Shopify describes bulk editing selected products and inventory, and spreadsheet updates for larger sets ([bulk editing](https://help.shopify.com/en/manual/shopify-admin/productivity-tools/bulk-editing), [bulk inventory editing](https://help.shopify.com/en/manual/inventory-and-locations/adjusting-inventory/bulk-editing-inventory)).
- Zoho Inventory documents import/update using a unique identifier and bulk overwrite, with backup and opening-stock checks in its migration guidance ([item import](https://www.zoho.com/us/inventory/help/items/items-overview.html), [bulk overwrite](https://www.zoho.com/us/inventory/kb/items/item-overwrite.html), [migration guidance](https://www.zoho.com/us/inventory/help/migration/migration-general.html)).
- Google recommends Desktop app OAuth for installed apps and explains refresh tokens; Google recommends the `drive.file` scope to limit app access to files it creates/uses ([OAuth for installed apps](https://developers.google.com/identity/protocols/oauth2), [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)).

These product documents inform feature patterns, not a claim that every competitor implements the entire roadmap or that the same online assumptions apply here.

## Relationship to other planning files

- [`master-plan.md`](master-plan.md): detailed module-by-module feature catalog and phase map.
- [`enterprise-implementation-plan.md`](enterprise-implementation-plan.md): implementation-oriented agent brief; update it from a phase-specific spec before using it as a coding task.
- [`SPEC.md`](../SPEC.md): existing architecture and previously recorded owner decisions; resolve the conflicts above before changing those decisions.
- [`task_progress.md`](../task_progress.md): old, incomplete ledger implementation checklist; reconcile or archive it when planning the next implementation task so it is not mistaken for the current roadmap.
