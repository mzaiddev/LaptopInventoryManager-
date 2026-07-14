# Agent Implementation Prompt

You are an implementation agent. Execute this task end to end in one coherent pass without splitting it into multiple waiting phases.

## Objective

Upgrade the existing inventory management application into a professional enterprise-grade system by extending the current architecture instead of replacing it. The implementation must be practical, maintainable, and ready for real-world wholesale business use.

## Context

The project already has working modules for dashboard, inventory, sales, returns, customers, ledgers, reports, settings, and backup. Your job is to improve these modules, connect them properly, and make the system more complete and business-ready.

## Core Constraints

- Preserve the existing architecture and current working behavior.
- Do not rebuild the application from scratch.
- Keep the current database structure compatible where possible.
- Extend existing services, IPC handlers, pages, and UI patterns rather than replacing them.
- Maintain backward compatibility with current data and workflows.
- Make the system reliable for real business use.

## What Must Be Implemented

### 1. Dashboard Upgrade

Transform the dashboard into a real business dashboard.

Requirements:

- Make every summary card clickable.
- Each card should open a detailed modal, drawer, or dedicated page.
- Show meaningful business data for inventory, sales, returns, outstanding balances, and valuation.
- Support filtering, search, date range selection, sorting, and pagination where relevant.
- Ensure the dashboard values are derived from the correct business data sources.

### 2. Customer Module Upgrade

Upgrade the customer experience to be enterprise-grade.

Requirements:

- Add or improve a dedicated customer detail view.
- Show customer information, sales history, payment history, return history, and damage history.
- Make each sale row expandable to show payment events, amounts, dates, remaining balance, payment method, and remarks.
- Provide a customer statement view that is printable and shareable.
- Link sales, returns, ledgers, payments, and damage history to the customer profile.
- Make customer search support name, phone, address, email, company, ledger reference, and sale reference.

### 3. Statements, Print, and Sharing

Make customer and ledger summaries professional and usable.

Requirements:

- Add printable customer statements.
- Add printable ledger statements.
- Add a professional shareable statement view suitable for WhatsApp.
- Include customer details, sale details, quantities, payments, outstanding balance, returns, and grand totals.
- Ensure the generated statement is visually clear and business-friendly.

### 4. Inventory and Damage Management

Improve inventory reporting and make stock movement accurate.

Requirements:

- Support current quantity, damaged quantity, reserved quantity, available quantity, purchase price, stock value, and product history.
- Handle damage as a separate stock state.
- Damaged stock must not be counted as available for sale.
- Damaged stock must be preserved in records and visible in reports and dashboard metrics.
- Allow damage entry and correction workflow.
- Ensure inventory totals and dashboard totals remain consistent.

### 5. Ledger and Outstanding Balance Improvements

Make ledger data more actionable and transparent.

Requirements:

- Show customer, invoice, payment history, outstanding balance, related sales, and related returns.
- Display running balance and payment progression clearly.
- Make outstanding reports readable and printable.
- Link ledger records to the relevant customer transactions.

### 6. Reports Module Improvement

Upgrade reports so they are useful for business operations.

Requirements:

- Improve sales, returns, inventory, customer, ledger, and outstanding reports.
- Add search, filters, date range, product selection, customer selection, category filters, status filters, printing, PDF export, and Excel export.
- Make reports consistent with the dashboard and ledger values.

### 7. Reconciliation and Data Integrity

Ensure the system remains numerically consistent.

Requirements:

- Dashboard totals must match report totals.
- Inventory values must reconcile with sales, returns, and damage adjustments.
- Customer statements must match ledger and payment data.
- Avoid duplicate counting or inconsistent calculations.

## Implementation Notes for the Agent

- Review the current codebase first and understand the existing data flow before modifying anything.
- Prefer small, focused, reusable changes over large risky rewrites.
- Reuse existing services and UI patterns wherever possible.
- Add proper loading states, empty states, validation, sorting, filtering, pagination, and error handling.
- Keep the code clean, readable, and maintainable.
- Do not remove existing functionality unless absolutely necessary.

## Execution Style

Work as one implementation task.
Do not pause for unnecessary phase approval.
Do not leave the work half-complete.
Implement the full business workflow end to end in a single pass wherever possible.

## Definition of Done

The task is complete when:

- the dashboard is interactive and business-focused
- the customer module shows full linked history and statements
- inventory and damage handling are properly separated from available stock
- ledger and outstanding views are clearer and more useful
- reports support professional filtering and export workflows
- the overall system is more complete, consistent, and ready for real business use

---

## 6. Database and Business Logic Rules

### 6.1 Inventory Rules

- inventory should always be based on the current quantities in the system
- damaged stock should be visible separately
- reserved stock should be visible separately
- available stock should be derived carefully from current inventory state
- sales reduce inventory
- returns restore inventory

### 6.2 Dashboard Financial Logic

The dashboard should show business metrics in a professional and auditable way.

Required dashboard financial cards:

- Total Sales Value
- Total Cost of Goods Sold (purchase value of sold items)
- Total Gross Profit
- Total Revenue after returns and adjustments
- Total Damaged Stock Value
- Total Outstanding Balance
- Total Collected
- Net Profit / Loss

Business logic should be implemented as follows:

- sales value should be based on the selling price of sold products from the sale transaction records
- cost should be based on the purchase price of the sold items from product records or sale item cost data
- gross profit should be calculated as total sales value minus total cost of goods sold
- net revenue should reflect actual sales less return adjustments and related credits
- damaged stock value should be calculated from the current damaged quantity multiplied by the purchase price or current valuation rule
- outstanding balance should come from ledger remaining balances
- collected amount should come from payments and ledger payments history

The dashboard should also show:

- total sales quantity
- total returned quantity
- total damaged quantity
- total available quantity
- total reserved quantity

Dashboard data source rules:

- sales totals must come from `sale_issues` and `sale_issue_items`
- return totals must come from `returns` and `return_items`
- damage totals must come from the dedicated damage records or damage adjustment workflow
- available stock should come from current active inventory quantity, excluding damaged stock
- damage should never be mixed into current stock calculations for available quantity or sales eligibility
- product status should be treated as a stock-state indicator, not as the only source of truth for sales or returns

### 6.3 Sales and Ledger Rules

- every sale should be linked to a ledger
- every ledger should show payment history
- payment updates should update remaining balance automatically
- returns should be reflected in the ledger if applicable
- the ledger should act as the main payment and balance record for the sale, while the sale itself remains the transaction record for products and quantity
- sales and ledger history should be built from the existing sales and ledger tables in a connected way, without introducing unnecessary extra tables for the same relationship
- the customer profile should be able to surface all sales, returns, ledgers, payments, and damages together in one unified view
- the customer view should allow the user to open any sale, return, ledger, or damage record directly from the customer profile
- sales and returns should also be searchable by customer details such as name, phone number, address, and company information
- damage events must not alter sales totals or ledger totals unless the damage is explicitly linked to a return, replacement, or adjustment
- damage reduction must reduce available stock only, not create false sales or false returns
- damaged products must remain visible in reports so the business can audit what is unusable but still in stock
- customer-related records such as sales, returns, ledgers, and damage history should support WhatsApp sharing using a professional image or PDF-style statement output
- the shared report should include customer information, sale/return/damage details, payment history, outstanding balance, and a business-friendly summary suitable for customer communication

### 6.4 Customer Reporting Rules

- customer statements must show each sale and all payments under that sale
- the customer should be able to see what amount was paid and what remains due for each sale
- damage-related adjustments must be clearly shown in the customer statement only when they affect the customer transaction, replacement, or return flow
- if a damaged product is not sold to the customer, it should not appear as a customer sale or customer ledger entry

### 6.5 Reporting Rules

- no report should calculate totals independently in a way that diverges from the main ledger and inventory data
- all totals should be audit-friendly

---

## 7. UI/UX Standards

The implementation must follow:

- current app design style
- professional modern look
- responsive layout
- clean spacing and hierarchy
- loading states
- empty states
- clear actions and buttons
- reusable components
- enterprise-grade visual consistency

---

## 8. Testing Checklist

After implementation, verify:

- dashboard cards open the correct details
- customer sales show payment history under each sale
- customer statements print correctly
- statements share correctly via WhatsApp
- inventory quantity calculations are correct
- damaged/reserved/in-stock numbers are correct
- damage workflow changes product status properly
- damaged stock is excluded from available sales quantity
- returns update stock correctly
- ledger outstanding balances are correct
- reports export properly
- no existing features are broken

---

## 9. Final Delivery Goal

The final application should feel like a complete real-world wholesale inventory, sales, ledger, customer, return, and reporting platform.

The system should be fully interconnected so that:

- dashboard → sales → customer → ledger → payments → returns → inventory → reports

all work together seamlessly and professionally.
