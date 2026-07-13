// Formatting Utilities
const Formatters = {
  formatCurrency(amount, currency = 'USD') {
    if (amount === undefined || amount === null) return '-';
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      }).format(amount);
    } catch {
      return `${amount} ${currency}`;
    }
  },

  formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return dateStr;
    }
  },

  formatDateTime(dateStr) {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  },

  formatRelativeTime(dateStr) {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return this.formatDate(dateStr);
    } catch {
      return dateStr;
    }
  },

  formatFileSize(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  },

  getStatusBadgeClass(status) {
    const map = {
      'In Stock': 'badge-in-stock',
      'Reserved': 'badge-reserved',
      'Sold': 'badge-sold',
      'Returned': 'badge-returned',
      'Damaged': 'badge-damaged',
      'Lost': 'badge-lost'
    };
    return map[status] || 'badge-in-stock';
  },

  getConditionBadgeClass(condition) {
    const map = {
      'Excellent': 'badge-excellent',
      'Good': 'badge-good',
      'Fair': 'badge-fair',
      'Damaged': 'badge-damaged',
      'For Parts': 'badge-for-parts'
    };
    return map[condition] || 'badge-excellent';
  }
};