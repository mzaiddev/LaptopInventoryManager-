// Pagination Component
class PaginationComponent {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.onPageChange = options.onPageChange || null;
    this.currentPage = 1;
    this.totalPages = 1;
    this.total = 0;
    this.limit = options.limit || 50;
  }

  update(total, page, totalPages) {
    this.total = total;
    this.currentPage = page;
    this.totalPages = totalPages;
    this.render();
  }

  render() {
    if (!this.container) return;

    if (this.totalPages <= 1) {
      this.container.innerHTML = '';
      return;
    }

    let html = '<div class="pagination">';

    // Previous button
    html += `<button ${this.currentPage <= 1 ? 'disabled' : ''} onclick="App.pagination.goToPage(${this.currentPage - 1})">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
    </button>`;

    // Page numbers
    const startPage = Math.max(1, this.currentPage - 2);
    const endPage = Math.min(this.totalPages, this.currentPage + 2);

    if (startPage > 1) {
      html += `<button onclick="App.pagination.goToPage(1)">1</button>`;
      if (startPage > 2) {
        html += `<span style="padding:8px 4px;color:var(--text-muted)">...</span>`;
      }
    }

    for (let i = startPage; i <= endPage; i++) {
      html += `<button class="${i === this.currentPage ? 'active' : ''}" onclick="App.pagination.goToPage(${i})">${i}</button>`;
    }

    if (endPage < this.totalPages) {
      if (endPage < this.totalPages - 1) {
        html += `<span style="padding:8px 4px;color:var(--text-muted)">...</span>`;
      }
      html += `<button onclick="App.pagination.goToPage(${this.totalPages})">${this.totalPages}</button>`;
    }

    // Next button
    html += `<button ${this.currentPage >= this.totalPages ? 'disabled' : ''} onclick="App.pagination.goToPage(${this.currentPage + 1})">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </button>`;

    // Info
    const start = (this.currentPage - 1) * this.limit + 1;
    const end = Math.min(this.currentPage * this.limit, this.total);
    html += `<span class="pagination-info">${start}-${end} of ${this.total}</span>`;

    html += '</div>';
    this.container.innerHTML = html;
  }

  goToPage(page) {
    if (page < 1 || page > this.totalPages || page === this.currentPage) return;
    this.currentPage = page;
    if (this.onPageChange) {
      this.onPageChange(page);
    }
  }
}

// Global reference
window.PaginationComponent = PaginationComponent;