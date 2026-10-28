const GlobalSearch = {
  results: [],
  timer: null,
  requestId: 0,
  esc(value) { return ShopInfo.esc(value == null ? '' : String(value)); },
  onInput() {
    clearTimeout(this.timer);
    const query = document.getElementById('global-search-input')?.value?.trim() || '';
    if (query.length < 2) { this.results = []; this.render(query); return; }
    this.render(query, true);
    this.timer = setTimeout(() => this.search(query), 220);
  },
  onKeydown(event) {
    if (event.key === 'Escape') this.close();
    if (event.key === 'Enter' && this.results.length) this.openResult(0);
  },
  async search(query) {
    const request = ++this.requestId;
    try {
      const [products, customers, sales] = await Promise.all([
        window.api.getProducts({ search:query, page:1, limit:5 }),
        window.api.searchCustomers(query),
        window.api.getAllSales({ search:query, page:1, limit:5 }),
      ]);
      if (request !== this.requestId || (document.getElementById('global-search-input')?.value?.trim() || '') !== query) return;
      this.results = [];
      if (products.success) (products.data.products || []).forEach((p) => this.results.push({ type:'Product', id:p.id, title:p.product_name, meta:[p.serial_number,p.model,p.category].filter(Boolean).join(' · '), page:'inventory' }));
      if (customers.success) (customers.data || []).forEach((c) => this.results.push({ type:'Customer', id:c.id, title:c.customer_name, meta:[c.phone,c.address].filter(Boolean).join(' · '), page:'customers' }));
      if (sales.success) (sales.data.sales || []).forEach((s) => this.results.push({ type:'Invoice', id:s.sale_id, ref:s.sale_reference, title:s.sale_reference, meta:[s.customer_name,s.customer_phone,s.transaction_date].filter(Boolean).join(' · '), page:'sales-history' }));
      this.results = this.results.slice(0, 12);
      this.render(query);
    } catch (err) {
      if (request === this.requestId) this.render(query, false, err.message);
    }
  },
  render(query, loading = false, error = '') {
    const box = document.getElementById('global-search-results');
    if (!box) return;
    if (!query || query.length < 2) { box.style.display = 'none'; return; }
    box.style.display = '';
    if (loading) { box.innerHTML = `<div class="global-search-hint">${this.esc(I18n.t('Searching…'))}</div>`; return; }
    if (error) { box.innerHTML = `<div class="global-search-hint">${this.esc(error)}</div>`; return; }
    if (!this.results.length) { box.innerHTML = `<div class="global-search-hint">${this.esc(I18n.t('No matching products, customers, or invoices.'))}</div>`; return; }
    box.innerHTML = this.results.map((r, i) => `<button class="global-search-result" onclick="GlobalSearch.openResult(${i})">
      <span class="global-search-type">${this.esc(I18n.t(r.type))}</span><span class="global-search-copy"><span class="global-search-title">${this.esc(r.title)}</span><span class="global-search-meta">${this.esc(r.meta)}</span></span>
    </button>`).join('');
  },
  async openResult(index) {
    const item = this.results[index];
    if (!item) return;
    this.close();
    if (item.page === 'customers') {
      await App.navigate('customers');
      await CustomersPage.viewCustomer(item.id);
    } else if (item.page === 'inventory') {
      await App.navigate('inventory');
      InventoryPage.viewProduct(item.id);
    } else {
      SalesHistoryPage.currentFilters = { ...SalesHistoryPage.currentFilters, search:item.ref || item.title, page:1 };
      await App.navigate('sales-history');
    }
  },
  close() {
    const box = document.getElementById('global-search-results');
    if (box) box.style.display = 'none';
  },
};

document.addEventListener('pointerdown', (event) => {
  const root = document.getElementById('global-search-root');
  if (root && !root.contains(event.target)) GlobalSearch.close();
});
window.GlobalSearch = GlobalSearch;
