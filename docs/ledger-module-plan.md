# Sales, Ledger, Customer, and Return Module Plan

## 1. Objective
Add a professional sales-and-ledger module to the existing inventory system so every sale or issue is tied to a customer ledger, stock movement, payment history, and printable reports.

This document is a planning document only. No implementation has started yet.

## 2. Core Business Flow
The system should work like a real-world shop ledger system.

### Main idea
When a customer buys or receives products:
1. A customer is selected or created instantly.
2. A sale/issue entry is created.
3. The entry is attached to a ledger.
4. Products are recorded with quantity and price.
5. Stock quantity is reduced automatically.
6. The payment is recorded as either:
   - Cash: full payment is settled immediately
   - Loan: remaining balance stays outstanding
7. Future payments are attached to the same ledger.
8. The full history can be viewed and searched later.

### Example
- Customer buys 2 laptops
- Total invoice value = 100,000
- Customer pays 50,000 now
- Remaining 50,000 becomes outstanding balance
- A ledger is created and linked to that sale issue
- Later, another payment of 20,000 is added
- The system shows the history clearly and updates the balance automatically

## 3. Main Functional Requirements

### A. Customer Management
The system must support:
- Create customer directly from the ledger/sale form
- Search customer by name, phone, address, or ID
- View customer details
- Edit customer information
- Track customer balance summary
- Mark customer as active or inactive
- Optional credit limit and notes

### B. Sale / Issue Creation
When creating a sale or issue:
- Select or create a customer instantly
- Choose sale/issue type
- Select one or more products
- Enter quantity for each product
- Enter selling price or total amount
- Choose ledger type: Cash or Loan
- Attach the transaction to a ledger automatically
- Save the transaction and reduce stock

### C. Ledger System
Each sale/issue should be linked to a ledger.

The ledger must show:
- Customer name
- Transaction date
- Total amount
- Paid amount
- Remaining balance
- Ledger type
- Status: Paid, Partial, or Outstanding
- Product list included in that sale
- Payment history

### D. Payment Handling
The system must support:
- Partial payment entry
- Multiple payment entries for the same ledger
- Payment date and notes
- Payment method such as Cash, Bank, Online, or Other
- Automatic remaining balance calculation
- Full settlement when balance becomes zero

### E. Search and History
The system must allow searching by:
- Customer name
- Phone number
- Ledger reference or invoice number
- Product name
- Date range
- Payment status

The user should be able to view:
- Full sale/issue history for a customer
- Full payment history for a ledger
- Product-wise transaction history
- Outstanding balance history

## 4. Recommended Data Structure
The existing products table should remain, and new tables should be added for the sales-ledger workflow.

### Suggested tables

#### customers
- id
- customer_name
- phone
- address
- email
- credit_limit
- opening_balance
- status
- created_at
- updated_at

#### sale_issues
- id
- customer_id
- ledger_id
- reference_no
- issue_date
- transaction_type
- total_amount
- paid_amount
- remaining_amount
- payment_status
- notes
- created_at
- updated_at

#### sale_issue_items
- id
- sale_issue_id
- product_id
- product_name
- quantity
- unit_price
- subtotal
- created_at

#### ledgers
- id
- customer_id
- ledger_type
- reference_no
- transaction_date
- description
- total_amount
- paid_amount
- remaining_amount
- status
- created_at
- updated_at

#### ledger_payments
- id
- ledger_id
- payment_date
- amount
- payment_method
- note
- created_at

#### returns
- id
- customer_id
- sale_issue_id
- ledger_id
- return_date
- reason
- total_return_amount
- status
- created_at
- updated_at

#### return_items
- id
- return_id
- product_id
- product_name
- quantity
- unit_price
- subtotal
- created_at

## 5. Stock and Inventory Rules
The stock logic should be professional and safe.

### Rules
- Product quantity must be reduced when a sale/issue is created.
- If stock is insufficient, the transaction must be blocked.
- A return should increase stock again.
- If a sale is canceled, the stock should be restored.
- Loan sales should still reduce stock, even if payment is pending.
- A sale should never be saved if the product availability is below the requested quantity.

## 6. Return / Refund / Credit Logic
A proper return system is important.

### Return workflow
- A user selects a previous sale/issue
- Selects one or more items from that sale
- Enters return quantity
- Chooses return reason
- Creates a return record
- Increases stock back into inventory
- Updates the customer ledger if needed
- Creates a credit adjustment if the return affects outstanding balance

### Return handling rules
- Partial returns should be supported
- Returned items should not be counted as sold anymore for that specific quantity
- Return value should be linked to the related ledger
- The user should be able to see return history for each customer or product

## 7. Reporting Requirements
The report system should be strong and practical.

### Report types
- Customer-wise sales and ledger report
- Outstanding balance report
- Daily sales report
- Monthly sales report
- Product-wise sales report
- Payment history report
- Return report
- Customer statement report

### Report features
- Date range filter
- Customer filter
- Product filter
- Ledger type filter
- Payment status filter
- Print-friendly layout
- Export or print preview support

## 8. Printing and Invoice Design
The system should support professional print output.

### Printable documents
- Sale/issue invoice
- Customer ledger statement
- Outstanding dues report
- Payment receipt
- Return note

### Print requirements
- Shop name and header
- Customer details
- Transaction date
- Product list with quantities and amounts
- Total amount
- Paid amount
- Remaining balance
- Clean and business-style layout

## 9. User Experience Requirements
The workflow should feel fast and intelligent.

### Recommended experience
- Customer can be created directly inside the sale form if not present
- Search box should find customer instantly
- The sale form should be simple and focused
- Ledger details should load immediately after a transaction is saved
- The user should be able to open full history from the customer or ledger screen
- The system should show at a glance whether the transaction is Cash, Loan, Partial, or Paid

## 10. Real-World Business Rules
To make the system practical, these rules should be included:
- One customer can have many sale/issue records
- One sale/issue can have one ledger record
- One ledger can have many payments
- A ledger can be partially paid or fully paid
- Cash sales are settled immediately
- Loan sales stay open until payment is completed
- A return may reduce or adjust the balance
- The system must clearly show the current due amount

## 11. Suggested Pages / Screens
Add the new module as a separate section in the app.

### Proposed screens
- Customers
- New Sale / New Issue
- Ledgers
- Ledger Details
- Payments
- Returns
- Reports
- Print Preview

## 12. Recommended Implementation Phases

### Phase 1: Foundation
- Create customer and ledger database tables
- Add sale/issue and payment tables
- Add service layer for business logic
- Add IPC handlers

### Phase 2: Customer and Sale Flow
- Add customer creation directly from sale form
- Add product selection and quantity entry
- Save sale/issue and attach ledger
- Reduce stock automatically

### Phase 3: Payment and Balance Tracking
- Add payment entries
- Update remaining balance automatically
- Show payment history and ledger status

### Phase 4: Returns and Adjustments
- Add return entry flow
- Restore stock on return
- Adjust ledger balance if needed

### Phase 5: Reports and Printing
- Add reports page
- Add search and filters
- Add print-friendly outputs

### Phase 6: Refinement
- Validation and error messages
- Better sorting and filters
- Clear status badges and summaries

## 13. Recommended First Milestone
The first milestone should be:
1. Create customer instantly from sale form
2. Create sale/issue and attach ledger
3. Track partial payment and remaining balance
4. Show full customer and ledger history
5. Support basic report and print view

This will give you a strong, real-world foundation before adding more advanced reporting and automation.
