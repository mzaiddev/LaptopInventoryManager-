# Implementation Plan - Ledger System

## Database Changes
- [x] Analyze existing schema (sale_issues, payments, old_balances)
- [ ] Add customer_ledger table migration in dbInit.js
- [ ] Add indexes for customer_ledger

## Service Layer Changes
- [ ] Update ledgerService.js - Add ledger CRUD methods
- [ ] Modify createSale() to auto-create ledger DEBIT entry
- [ ] Modify addPayment() to auto-create ledger CREDIT entry
- [ ] Update getCustomerFullProfile() to include ledger data
- [ ] Add getCustomerLedger() method
- [ ] Add getCustomerLedgerBalance() method
- [ ] Update oldBalanceService.js - sync old balances to ledger
- [ ] Update dashboardService.js - use ledger data

## IPC Layer
- [ ] Add ledger IPC handlers to ipcHandlers.js
- [ ] Add ledger methods to preload.js

## UI - Ledger Page (ledgers.js)
- [ ] Complete redesign - show customer ledger view
- [ ] Add customer selection dropdown
- [ ] Show remaining/old/total balance when customer selected
- [ ] Show ledger entries table (debit/credit/running balance)
- [ ] Add payment form within ledger
- [ ] Add old balance entry within ledger
- [ ] Print functionality

## UI - Customer Profile (customers.js)
- [ ] Update to show both sales and ledger entries
- [ ] Show combined balance properly
- [ ] Statement generation with ledger data

## Dashboard
- [ ] Update dashboard service to include ledger-based totals
- [ ] Update dashboard page

## Testing
- [ ] Install dependencies if needed
- [ ] Test the application startup
- [ ] Verify all features work