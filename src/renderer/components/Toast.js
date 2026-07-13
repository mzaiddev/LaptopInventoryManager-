// Toast Notification Component
class ToastComponent {
  constructor() {
    this.container = document.getElementById('toast-container');
    this.timeouts = new Map();
  }

  show(message, type = 'success', duration = 4000) {
    if (!this.container) {
      console.warn('Toast container not found');
      return;
    }

    const icons = {
      success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;flex-shrink:0;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
      error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;flex-shrink:0;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;flex-shrink:0;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      ${icons[type] || icons.success}
      <span style="flex:1;">${message}</span>
      <button onclick="this.parentElement.remove()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:18px;padding:0;line-height:1;">&times;</button>
    `;

    this.container.appendChild(toast);

    const timeout = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
      this.timeouts.delete(toast);
    }, duration);

    this.timeouts.set(toast, timeout);
  }

  success(message) {
    this.show(message, 'success');
  }

  error(message) {
    this.show(message, 'error', 6000);
  }

  warning(message) {
    this.show(message, 'warning', 5000);
  }
}

// Global instance - renamed to avoid class name conflict
try {
  window.Toast = new ToastComponent();
  console.log('Toast initialized');
} catch (e) {
  console.error('Toast init error:', e);
}