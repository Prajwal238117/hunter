import { auth, db } from './firebase-config.js';
import { signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { showToast } from './toast.js';

// Turnstile callback must be on window for data-callback to find it
// Turnstile removed in UI; keep stub safe
window.onTurnstileSuccess = function() {};

// Cloudflare Images configuration - Update these with your actual values
const CLOUDFLARE_CONFIG = {
  accountId: 'YOUR_CLOUDFLARE_ACCOUNT_ID', // Replace with your Cloudflare Account ID
  apiToken: 'YOUR_CLOUDFLARE_API_TOKEN',   // Replace with your Cloudflare API Token
  imageDeliveryUrl: 'https://imagedelivery.net/YOUR_ACCOUNT_HASH' // Replace with your delivery URL
};

async function uploadToCloudflareImages(file, progressCallback) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('metadata', JSON.stringify({
    uploadedBy: 'payment-form',
    timestamp: Date.now()
  }));

  try {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_CONFIG.accountId}/images/v1`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CLOUDFLARE_CONFIG.apiToken}`,
      },
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Upload failed: ${errorData.errors?.[0]?.message || response.statusText}`);
    }

    const result = await response.json();
    
    if (result.success) {
      return {
        id: result.result.id,
        url: result.result.variants[0], // Use first variant URL
        filename: result.result.filename
      };
    } else {
      throw new Error(`Upload failed: ${result.errors?.[0]?.message || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('Cloudflare Images upload error:', error);
    throw error;
  }
}

function attachScreenshotPreview() {
  document.addEventListener('change', function(e) {
    if (e.target && e.target.id === 'paymentScreenshot') {
      const file = e.target.files && e.target.files[0];
      const preview = document.getElementById('screenshotPreview');
      if (file && preview) {
        const isImage = (file.type || '').startsWith('image/');
        const maxBytes = 10 * 1024 * 1024; // 10MB
        if (!isImage) {
          showToast('Please select a valid image file.', 'error');
          e.target.value = '';
          preview.style.display = 'none';
          return;
        }
        if (file.size > maxBytes) {
          showToast('File too large. Max size is 10 MB.', 'error');
          e.target.value = '';
          preview.style.display = 'none';
          return;
        }
        const reader = new FileReader();
        reader.onload = ev => { preview.src = ev.target.result; preview.style.display = 'block'; };
        reader.readAsDataURL(file);
      }
    }
  });
}

async function ensureAnonymousAuth() {
  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }
}

function getSelectedPaymentMethod() {
  const input = document.querySelector('input[name="paymentMethod"]:checked');
  return input ? input.value : null;
}

function getOrderTotal() {
  const totalRow = document.querySelector('.summary-totals .total-row.total span:last-child');
  return totalRow ? totalRow.textContent.trim() : '';
}

function setQrByMethod(method) {
  const img = document.getElementById('qrPreview');
  if (!img) return;
  const map = {
    esewa: 'esewa.jpg',
    khalti: 'khalti.jpg',
    imepay: 'imepay.jpg',
    binance: 'binance.jpg'
  };
  img.src = map[method] || map.esewa;
}

let currentCart = [];

function handleSubmit() {
  const form = document.getElementById('paymentForm');
  const submitBtn = document.querySelector('.btn-complete-order');
  const progressEl = document.getElementById('uploadProgress');
  const fileInput = document.getElementById('paymentScreenshot');
  const cfTokenInput = document.getElementById('cfTurnstileToken');
  const extraWrap = document.getElementById('extraFieldsSection');
  const extraContainer = document.getElementById('extraFieldsContainer');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Check terms checkbox manually since it might be styled
    const termsCheckbox = document.querySelector('input[name="terms"]');
    if (termsCheckbox && !termsCheckbox.checked) {
      showToast('Please agree to the Terms of Service and Privacy Policy', 'error');
      termsCheckbox.focus();
      return;
    }
    
    if (!form.reportValidity()) return;

    const file = fileInput && fileInput.files && fileInput.files[0];
    if (!file) {
      showToast('Please upload a payment screenshot.', 'info');
      return;
    }

    // No verification now

    const originalBtnText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Processing...';

    try {
      await ensureAnonymousAuth();

      // Upload to Cloudflare Images
      if (progressEl) progressEl.value = 0;
      
      const uploadResult = await uploadToCloudflareImages(file, (progress) => {
        if (progressEl) {
          progressEl.value = progress;
        }
      });
      
      if (progressEl) progressEl.value = 100;

      // Get extra fields data from checkout data or cart
      const checkoutData = JSON.parse(localStorage.getItem('checkoutData') || '{}');
      const extraValues = checkoutData.extraFieldsData || [];

      const payload = {
        email: document.getElementById('email')?.value || '',
        phone: document.getElementById('phone')?.value || '',
        fullName: document.getElementById('fullName')?.value || '',
        paymentMethod: getSelectedPaymentMethod(),
        orderTotal: getOrderTotal(),
        orderItems: currentCart,
        orderExtras: extraValues,
        screenshotImageId: uploadResult.id,
        screenshotUrl: uploadResult.url,
        screenshotFilename: uploadResult.filename,
        turnstileToken: '',
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'payments'), payload);

      showToast("Thank you! Your order has been submitted. We'll review your payment shortly.", 'success');
      form.reset();
      if (progressEl) progressEl.value = 0;
      const preview = document.getElementById('screenshotPreview');
      if (preview) preview.style.display = 'none';
    } catch (err) {
      console.error('Payment submission error:', err);
      
      if (err.message && err.message.includes('Upload failed')) {
        showToast(`Image upload failed: ${err.message}`, 'error');
      } else if (err.message && err.message.includes('Unauthorized')) {
        showToast('Upload failed: Please check Cloudflare Images configuration.', 'error');
      } else if (err.message && err.message.includes('network')) {
        showToast('Network error. Please check your connection and try again.', 'error');
      } else {
        showToast('Submission failed. Please try again.', 'error');
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalBtnText || 'Complete Order';
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  attachScreenshotPreview();
  // Prefill account name from auth profile if available
  onAuthStateChanged(auth, (user) => {
    const fullName = document.getElementById('fullName');
    if (fullName) fullName.value = user?.displayName || '';
    const emailEl = document.getElementById('email');
    if (emailEl && user?.email) emailEl.value = user.email;
  });

  // Bind QR changes
  document.querySelectorAll('input[name="paymentMethod"]').forEach(r => {
    r.addEventListener('change', () => setQrByMethod(r.value));
  });
  const checked = document.querySelector('input[name="paymentMethod"]:checked');
  setQrByMethod(checked ? checked.value : 'esewa');

  // Reflect email in delivery box
  const emailInput = document.getElementById('email');
  const deliver = document.getElementById('deliverEmail');
  if (emailInput && deliver) {
    const sync = () => deliver.textContent = emailInput.value || '-';
    emailInput.addEventListener('input', sync); sync();
  }

  // Render cart items from localStorage
  try {
    const cart = JSON.parse(localStorage.getItem('cart') || '[]');
    currentCart = cart;
    
    const itemsEl = document.getElementById('summaryItems');
    const subtotalEl = document.getElementById('summarySubtotal');
    const totalEl = document.getElementById('summaryTotal');
    const completeLabel = document.getElementById('completeLabel');
    const extraWrap = document.getElementById('extraFieldsSection');
    const extraContainer = document.getElementById('extraFieldsContainer');
    
    if (itemsEl) {
      itemsEl.innerHTML = cart.map(item => `
        <div class="cart-item">
          <div class="item-image"><i class="fas fa-gamepad"></i></div>
          <div class="item-details">
            <h4>${item.name}</h4>
            <p>${item.variant?.label || ''}</p>
            <span class="item-price">Rs ${Number(item.price).toFixed(2)}</span>
          </div>
          <div class="item-quantity"><span>${item.quantity || 1}</span></div>
        </div>
      `).join('');
    }
    const subtotal = cart.reduce((t, i) => t + Number(i.price) * (i.quantity || 1), 0);
    if (subtotalEl) subtotalEl.textContent = `Rs ${subtotal.toFixed(2)}`;
    if (totalEl) totalEl.textContent = `Rs ${subtotal.toFixed(2)}`;
    if (completeLabel) completeLabel.textContent = `Complete Order - Rs ${subtotal.toFixed(2)}`;

    // Show extra fields data from checkout (read-only)
    const checkoutData = JSON.parse(localStorage.getItem('checkoutData') || '{}');
    const extraFieldsData = checkoutData.extraFieldsData || [];
    
    if (extraFieldsData.length > 0 && extraWrap && extraContainer) {
      extraWrap.style.display = 'block';
      extraContainer.innerHTML = extraFieldsData.map(field => `
        <div class="form-group extra-field-display">
          <label>${field.label}:</label>
          <div class="field-value">${field.value || '-'}</div>
        </div>
      `).join('');
    }
  } catch {}
  handleSubmit();
});


