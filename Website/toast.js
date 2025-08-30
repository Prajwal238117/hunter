// Simple toast utility for the whole site
const TOAST_CONTAINER_ID = 'toast-container';
const MAX_TOASTS = 3;

function ensureContainer() {
  let container = document.getElementById(TOAST_CONTAINER_ID);
  if (!container) {
    container = document.createElement('div');
    container.id = TOAST_CONTAINER_ID;
    container.className = 'toast-container';
    container.setAttribute('role', 'status');
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
  }
  return container;
}

export function showToast(message, type = 'info', { timeout = 4000 } = {}) {
  const container = ensureContainer();
  // Limit concurrent toasts
  while (container.children.length >= MAX_TOASTS) {
    container.firstChild?.remove();
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  const close = document.createElement('button');
  close.className = 'toast-close';
  close.setAttribute('aria-label', 'Close');
  close.textContent = '×';
  close.addEventListener('click', () => {
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 200);
  });
  toast.appendChild(close);

  container.appendChild(toast);

  // Auto-dismiss
  if (timeout > 0) {
    setTimeout(() => {
      toast.classList.add('hide');
      setTimeout(() => toast.remove(), 200);
    }, timeout);
  }

  return toast;
}


