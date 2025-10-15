// Payment.js - Updated with coupon tracking functionality
// Version: 2024-01-15 - Fixed appliedCoupon scope issue

import { auth, db } from './firebase-config.js';
import { signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { collection, addDoc, serverTimestamp, updateDoc, doc } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { getWalletBalance, spendFromWallet, getCurrentUser } from './wallet.js';
import { showToast } from './toast.js';

// Turnstile callback must be on window for data-callback to find it
// Turnstile removed in UI; keep stub safe
window.onTurnstileSuccess = function() {};

// Cloudflare Images configuration
const CLOUDFLARE_CONFIG = {
  accountId: '299aafd8a8b053d38c5e7fe12efeb619', // Your Cloudflare Account ID
  accountHash: 'sa5wvaEF1ck0fjfLwJyGTg', // Your Cloudflare Account Hash
  apiToken: 'zXz2F5-YJ1NooUktiTS1bSKKBsdyInh-F50WpFqy',   // Your Cloudflare API Token
  imageDeliveryUrl: 'https://imagedelivery.net/sa5wvaEF1ck0fjfLwJyGTg/<image_id>/<variant_name>' // Your delivery URL
};

async function uploadToCloudflareImages(file, progressCallback) {
  try {
    // Since Cloudflare Images API has CORS restrictions for browser uploads,
    // we'll use base64 storage as the primary method
    console.log('Using base64 storage for reliable image upload...');
    return await uploadAsBase64(file);
  } catch (error) {
    console.error('Image upload error:', error);
    throw error;
  }
}

async function uploadAsBase64(file) {
  return new Promise((resolve, reject) => {
    // Check file size (limit to 2MB for Firestore compatibility)
    const maxSize = 2 * 1024 * 1024; // 2MB limit
    
    if (file.size > maxSize) {
      reject(new Error('File too large. Please use a smaller image (max 2MB).'));
      return;
    }

    // Set a timeout to prevent hanging
    const timeout = setTimeout(() => {
      reject(new Error('Image processing timed out. Please try again with a smaller image.'));
    }, 15000); // 15 second timeout

    // Compress and resize image before converting to base64
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      try {
        clearTimeout(timeout); // Clear timeout on success
        
        // Calculate new dimensions (max 800x600 to reduce size)
        let { width, height } = img;
        const maxWidth = 800;
        const maxHeight = 600;
        
        if (width > height) {
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = (width * maxHeight) / height;
            height = maxHeight;
          }
        }
        
        // Set canvas dimensions
        canvas.width = width;
        canvas.height = height;
        
        // Draw and compress image
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to base64 with compression (0.7 quality)
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
        
        // Check if compressed size is still too large
        if (compressedBase64.length > 800000) { // ~800KB limit
          reject(new Error('Image too large even after compression. Please use a smaller image.'));
          return;
        }
        
        resolve({
          id: `base64_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          url: compressedBase64,
          filename: file.name,
          isBase64: true,
          size: compressedBase64.length,
          originalSize: file.size
        });
      } catch (error) {
        clearTimeout(timeout); // Clear timeout on error
        reject(new Error(`Image processing failed: ${error.message}`));
      }
    };
    
    img.onerror = () => {
      clearTimeout(timeout); // Clear timeout on error
      reject(new Error('Failed to load image'));
    };
    
    // Create object URL for the image
    const objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;
    
    // Clean up object URL after a delay to ensure image is loaded
    setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 1000);
  });
}

function attachScreenshotPreview() {
  document.addEventListener('change', function(e) {
    if (e.target && e.target.id === 'paymentScreenshot') {
      const file = e.target.files && e.target.files[0];
      const preview = document.getElementById('screenshotPreview');
      if (file && preview) {
        const isImage = (file.type || '').startsWith('image/');
        const maxBytes = 2 * 1024 * 1024; // 2MB limit for Firestore compatibility
        if (!isImage) {
          showToast('Please select a valid image file.', 'error');
          e.target.value = '';
          preview.style.display = 'none';
          return;
        }
        if (file.size > maxBytes) {
          showToast('File too large. Max size is 2 MB.', 'error');
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
    imepay: 'khalti.jpg'
  };
  img.src = map[method] || map.esewa;
}

let currentCart = [];

// Spin wheel rewards with probabilities
const REWARDS = [
    { amount: 1, probability: 75 },
    { amount: 5, probability: 20 },
    { amount: 50, probability: 4.99 },
    { amount: 1000, probability: 0.1 }
];

// Generate 16-digit alphanumeric code
function generateSpinCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 16; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Determine reward based on probability
function getRandomReward() {
    const random = Math.random() * 100;
    let cumulative = 0;
    
    for (const reward of REWARDS) {
        cumulative += reward.probability;
        if (random <= cumulative) {
            return reward;
        }
    }
    
    // Fallback to first reward
    return REWARDS[0];
}

function handleSubmit() {
  const form = document.getElementById('paymentForm');
  const submitBtn = document.querySelector('.btn-complete-order');
  const fileInput = document.getElementById('paymentScreenshot');
  const cfTokenInput = document.getElementById('cfTurnstileToken');
  const extraWrap = document.getElementById('extraFieldsSection');
  const extraContainer = document.getElementById('extraFieldsContainer');

  // Check if this is a wallet top-up request
  const urlParams = new URLSearchParams(window.location.search);
  const isWalletTopup = urlParams.get('type') === 'wallet';
  const topupId = urlParams.get('topupId');
  const topupAmount = urlParams.get('amount');
  const topupMethod = urlParams.get('method');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!form.reportValidity()) return;

    const method = getSelectedPaymentMethod();
    const isWallet = method === 'wallet';
    const file = fileInput && fileInput.files && fileInput.files[0];
    
    // For wallet top-up, we need a screenshot
    if (isWalletTopup) {
      if (!file) {
        showToast('Please upload a payment screenshot.', 'info');
        return;
      }
    } else if (!isWallet) {
      if (!file) {
        showToast('Please upload a payment screenshot.', 'info');
        return;
      }
    }

    // Get coupon data for tracking
    let appliedCoupon = null;
    console.log('Starting coupon data retrieval for payment tracking...');
    
    // Try to get coupon data from multiple sources
    const checkoutData = localStorage.getItem('checkoutData');
    if (checkoutData) {
      try {
        const parsed = JSON.parse(checkoutData);
        if (parsed.appliedCoupon && parsed.appliedCoupon.code) {
          appliedCoupon = parsed.appliedCoupon;
          console.log('Found coupon in checkoutData:', appliedCoupon.code);
        }
      } catch (e) {
        console.log('Invalid checkout data, trying alternative sources...');
      }
    }
    
    // If not found in checkoutData, try tempCouponData
    if (!appliedCoupon) {
      const tempCouponRaw = localStorage.getItem('tempCouponData');
      if (tempCouponRaw && tempCouponRaw !== 'null' && tempCouponRaw !== 'undefined') {
        try {
          appliedCoupon = JSON.parse(tempCouponRaw);
          if (!appliedCoupon || typeof appliedCoupon !== 'object' || !appliedCoupon.code) {
            appliedCoupon = null;
          }
        } catch (e) {
          appliedCoupon = null;
        }
      }
    }
    
    // Fallback: try the old appliedCoupon location
    if (!appliedCoupon) {
      const appliedCouponRaw = localStorage.getItem('appliedCoupon');
      if (appliedCouponRaw && appliedCouponRaw !== 'null' && appliedCouponRaw !== 'undefined') {
        try {
          appliedCoupon = JSON.parse(appliedCouponRaw);
          if (!appliedCoupon || typeof appliedCoupon !== 'object' || !appliedCoupon.code) {
            appliedCoupon = null;
          }
        } catch (e) {
          appliedCoupon = null;
        }
      }
    }

    // No verification now

    const originalBtnText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    
    // Safety timeout to prevent button from staying stuck
    const safetyTimeout = setTimeout(() => {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnText || 'Complete Order';
      showToast('Request timed out. Please try again.', 'error');
    }, 30000); // 30 second timeout

    try {
      await ensureAnonymousAuth();

      // Handle wallet top-up flow
      if (isWalletTopup) {
        const user = await getCurrentUser();
        if (!user || user.isAnonymous) {
          showToast('Please log in to process wallet top-up.', 'error');
          clearTimeout(safetyTimeout);
          return;
        }

        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing Image...';
        const uploadResult = await uploadToCloudflareImages(file);
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting Request...';

        // Update the wallet top-up request with payment details
        const topupUpdateData = {
          paymentScreenshot: uploadResult.id,
          paymentScreenshotUrl: uploadResult.url,
          paymentScreenshotFilename: uploadResult.filename,
          imageSize: uploadResult.size,
          originalSize: uploadResult.originalSize,
          submittedAt: serverTimestamp(),
          status: 'pending_verification'
        };

        await updateDoc(doc(db, 'walletTopups', topupId), topupUpdateData);

        // Redirect to success page
        const successUrl = `order-success.html?type=wallet_topup&topupId=${topupId}&amount=${topupAmount}&method=${topupMethod}`;
        clearTimeout(safetyTimeout);
        window.location.href = successUrl;
        return;
      }

      const methodNow = getSelectedPaymentMethod();
      if (methodNow === 'wallet') {
        // Wallet flow: ensure authenticated, sufficient balance, then create order and deduct
        const user = await getCurrentUser();
        if (!user || user.isAnonymous) {
          showToast('Please log in to use wallet payment.', 'error');
          clearTimeout(safetyTimeout);
          return;
        }

        // Calculate total numeric
        const totalText = getOrderTotal();
        const totalNum = parseFloat(String(totalText).replace(/[^0-9.]/g, '')) || 0;

        // Check balance
        const balance = await getWalletBalance(user.uid);
        if (balance < totalNum) {
          showToast('Insufficient wallet balance.', 'error');
          clearTimeout(safetyTimeout);
          return;
        }

        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Charging Wallet...';

        // Create payment document first for record
        const productIds = currentCart.map(item => item.productId).filter(id => id);
        const payload = {
          email: document.getElementById('email')?.value || '',
          phone: document.getElementById('phone')?.value || '',
          fullName: document.getElementById('fullName')?.value || '',
          paymentMethod: 'wallet',
          orderTotal: `Rs ${totalNum.toFixed(2)}`,
          orderItems: currentCart,
          productIds: productIds,
          screenshotImageId: null,
          screenshotUrl: null,
          screenshotFilename: null,
          imageSize: null,
          originalSize: null,
          turnstileToken: '',
          createdAt: serverTimestamp(),
          needsManualVerification: false,
          status: 'approved',
          orderStatus: 'pending'
        };
        const paymentDoc = await addDoc(collection(db, 'payments'), payload);

        // Deduct from wallet
        await spendFromWallet(user.uid, totalNum, { paymentId: paymentDoc.id });

        // Generate 16-digit spin code for wallet purchases
        const spinCode = generateSpinCode();
        const reward = getRandomReward();
        
        // Save spin code to database
        await addDoc(collection(db, 'spinCodes'), {
          userId: user.uid,
          code: spinCode,
          amount: reward.amount,
          isUsed: false,
          createdAt: serverTimestamp(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        });

        // Redirect to order success with spin code
        const successUrl = `order-success.html?orderId=${paymentDoc.id}&total=${totalNum.toFixed(2)}&method=wallet&spinCode=${spinCode}&reward=${reward.amount}`;
        clearTimeout(safetyTimeout);
        window.location.href = successUrl;
        return;
      }

      // Non-wallet flow: process image upload
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing Image...';
      const uploadResult = await uploadToCloudflareImages(file);
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting Order...';



      // Get product IDs from cart items
      const productIds = currentCart.map(item => item.productId).filter(id => id);
      
      // Check if image is too large for Firestore
      let payload;
      if (uploadResult.size > 800000) { // If still over ~800KB
        // Store only metadata, admin will need to verify manually
        payload = {
          email: document.getElementById('email')?.value || '',
          phone: document.getElementById('phone')?.value || '',
          fullName: document.getElementById('fullName')?.value || '',
          paymentMethod: getSelectedPaymentMethod(),
          orderTotal: getOrderTotal(),
          orderItems: currentCart,
          productIds: productIds,
          screenshotImageId: uploadResult.id,
          screenshotUrl: 'MANUAL_VERIFICATION_REQUIRED',
          screenshotFilename: uploadResult.filename,
          imageSize: uploadResult.size,
          originalSize: uploadResult.originalSize,
          turnstileToken: '',
          createdAt: serverTimestamp(),
          needsManualVerification: true
        };
      } else {
        // Store full image data
        payload = {
          email: document.getElementById('email')?.value || '',
          phone: document.getElementById('phone')?.value || '',
          fullName: document.getElementById('fullName')?.value || '',
          paymentMethod: getSelectedPaymentMethod(),
          orderTotal: getOrderTotal(),
          orderItems: currentCart,
          productIds: productIds,
          screenshotImageId: uploadResult.id,
          screenshotUrl: uploadResult.url,
          screenshotFilename: uploadResult.filename,
          imageSize: uploadResult.size,
          originalSize: uploadResult.originalSize,
          turnstileToken: '',
          createdAt: serverTimestamp(),
          needsManualVerification: false,
          status: 'pending',
          orderStatus: 'pending'
        };
      }

      const paymentDoc = await addDoc(collection(db, 'payments'), payload);

      // Get order details for success page
      const orderId = paymentDoc.id;

      // Track coupon usage if a coupon was applied
      if (appliedCoupon && appliedCoupon.code) {
        try {
          console.log('Tracking coupon usage:', appliedCoupon.code);
          await trackCouponUsage(appliedCoupon, productIds, orderId);
        } catch (error) {
          console.error('Error tracking coupon usage:', error);
          // Don't fail the payment if coupon tracking fails
        }
      } else {
        console.log('No coupon applied or coupon data missing');
      }
      const orderTotal = getOrderTotal();
      const paymentMethod = getSelectedPaymentMethod();

      // Clear safety timeout
      clearTimeout(safetyTimeout);
      
      // Clear coupon data when order is completed successfully
      if (typeof window.clearCouponData === 'function') {
        window.clearCouponData();
      } else {
        // Fallback: clear coupon data directly
        localStorage.removeItem('appliedCoupon');
        localStorage.removeItem('tempCouponData');
      }
      
      // Redirect to success page with order details
      const successUrl = `order-success.html?orderId=${orderId}&total=${orderTotal.replace('Rs ', '')}&method=${paymentMethod}`;
      window.location.href = successUrl;
    } catch (err) {
      // Clear safety timeout
      clearTimeout(safetyTimeout);
      console.error('Payment submission error:', err);
      
      // Handle specific image processing errors
      if (err.message && err.message.includes('File too large')) {
        showToast(`Image too large: ${err.message}`, 'error');
      } else if (err.message && err.message.includes('Image processing failed')) {
        showToast(`Image processing error: ${err.message}`, 'error');
      } else if (err.message && err.message.includes('Image processing timed out')) {
        showToast('Image processing took too long. Please try with a smaller image.', 'error');
      } else if (err.message && err.message.includes('Failed to load image')) {
        showToast('Failed to process image. Please try with a different image file.', 'error');
      } else if (err.message && err.message.includes('Upload failed')) {
        showToast(`Image upload failed: ${err.message}`, 'error');
      } else if (err.message && err.message.includes('Unauthorized')) {
        showToast('Upload failed: Please check Cloudflare Images configuration.', 'error');
      } else if (err.message && err.message.includes('network')) {
        showToast('Network error. Please check your connection and try again.', 'error');
      } else {
        showToast(`Submission failed: ${err.message || 'Please try again.'}`, 'error');
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnText || 'Complete Order';
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
    r.addEventListener('change', async () => {
      const method = r.value;
      setQrByMethod(method);
      const ss = document.getElementById('screenshotSection');
      const fileInput = document.getElementById('paymentScreenshot');
      const walletRow = document.getElementById('walletBalanceRow');
      const qrSection = document.getElementById('qrSection');
      if (method === 'wallet') {
        if (ss) ss.style.display = 'none';
        if (fileInput) fileInput.required = false;
        if (walletRow) walletRow.style.display = 'block';
        if (qrSection) qrSection.style.display = 'none';
        // Show balance if logged in
        const user = await getCurrentUser();
        if (user && !user.isAnonymous) {
          const bal = await getWalletBalance(user.uid);
          const el = document.getElementById('walletBalanceDisplay');
          if (el) el.textContent = `Rs ${bal.toFixed(2)}`;
        }
      } else {
        if (ss) ss.style.display = '';
        if (fileInput) fileInput.required = true;
        if (walletRow) walletRow.style.display = 'none';
        if (qrSection) qrSection.style.display = '';
      }
    });
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
    
    // Try to get coupon data from multiple sources
    let appliedCoupon = null;
    
    // First, try to get from checkoutData
    const checkoutData = localStorage.getItem('checkoutData');
    if (checkoutData) {
      try {
        const parsed = JSON.parse(checkoutData);
        if (parsed.appliedCoupon && parsed.appliedCoupon.code) {
          appliedCoupon = parsed.appliedCoupon;
        }
      } catch (e) {
        console.warn('Invalid checkout data, trying alternative sources...');
      }
    }
    
    // If not found in checkoutData, try tempCouponData
    if (!appliedCoupon) {
      const tempCouponRaw = localStorage.getItem('tempCouponData');
      if (tempCouponRaw && tempCouponRaw !== 'null' && tempCouponRaw !== 'undefined') {
        try {
          appliedCoupon = JSON.parse(tempCouponRaw);
          // Validate coupon structure
          if (!appliedCoupon || typeof appliedCoupon !== 'object' || !appliedCoupon.code) {
            appliedCoupon = null;
            localStorage.removeItem('tempCouponData'); // Clean up invalid data
          }
        } catch (e) {
          console.warn('Invalid temp coupon data, removing...');
          appliedCoupon = null;
          localStorage.removeItem('tempCouponData');
        }
      }
    }
    
    // Fallback: try the old appliedCoupon location
    if (!appliedCoupon) {
      const appliedCouponRaw = localStorage.getItem('appliedCoupon');
      if (appliedCouponRaw && appliedCouponRaw !== 'null' && appliedCouponRaw !== 'undefined') {
        try {
          appliedCoupon = JSON.parse(appliedCouponRaw);
          // Validate coupon structure
          if (!appliedCoupon || typeof appliedCoupon !== 'object' || !appliedCoupon.code) {
            appliedCoupon = null;
            localStorage.removeItem('appliedCoupon'); // Clean up invalid data
          }
        } catch (e) {
          console.warn('Invalid coupon data in localStorage, removing...');
          appliedCoupon = null;
          localStorage.removeItem('appliedCoupon');
        }
      }
    }
    
    currentCart = cart;
    
    const itemsEl = document.getElementById('summaryItems');
    const subtotalEl = document.getElementById('summarySubtotal');
    const totalEl = document.getElementById('summaryTotal');
    const completeLabel = document.getElementById('completeLabel');
    const discountEl = document.getElementById('summaryDiscount');
    const discountAmountEl = document.getElementById('summaryDiscountAmount');
    const extraWrap = document.getElementById('extraFieldsSection');
    const extraContainer = document.getElementById('extraFieldsContainer');
    
    if (itemsEl) {
      itemsEl.innerHTML = cart.map(item => `
        <div class="cart-item">
          <div class="item-image">
            ${item.image ? 
              `<img src="${item.image}" alt="${item.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">` : 
              ''
            }
            <i class="fas fa-gamepad" style="${item.image ? 'display: none;' : 'display: flex;'}"></i>
          </div>
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
    let discount = 0;
    let finalTotal = subtotal;
    
    // Check if coupon is applied
    console.log('Payment page - Coupon check:', { 
      appliedCoupon, 
      subtotal,
      checkoutData: localStorage.getItem('checkoutData') ? 'exists' : 'not found',
      tempCouponData: localStorage.getItem('tempCouponData') ? 'exists' : 'not found',
      oldAppliedCoupon: localStorage.getItem('appliedCoupon') ? 'exists' : 'not found'
    });
    
    if (appliedCoupon && appliedCoupon.isActive !== false && appliedCoupon.code) {
      if (appliedCoupon.type === 'percentage') {
        discount = (subtotal * appliedCoupon.value) / 100;
      } else {
        discount = Math.min(appliedCoupon.value, subtotal);
      }
      finalTotal = Math.max(0, subtotal - discount);
      
      console.log('Payment page - Coupon applied:', { discount, finalTotal });
      
      // Show discount row
      if (discountEl && discountAmountEl) {
        discountEl.style.display = 'flex';
        discountAmountEl.textContent = `-Rs ${discount.toFixed(2)}`;
      }
    } else {
      // Hide discount row if no coupon
      if (discountEl) {
        discountEl.style.display = 'none';
      }
      // Ensure no discount is applied
      discount = 0;
      finalTotal = subtotal;
      
      console.log('Payment page - No coupon, final total:', finalTotal);
    }
    
    if (subtotalEl) subtotalEl.textContent = `Rs ${subtotal.toFixed(2)}`;
    if (totalEl) totalEl.textContent = `Rs ${finalTotal.toFixed(2)}`;
    if (completeLabel) completeLabel.textContent = `Complete Order - Rs ${finalTotal.toFixed(2)}`;

  } catch {}
  handleSubmit();
});

// Function to track coupon usage
async function trackCouponUsage(coupon, productIds, orderId) {
  try {
    // Calculate discount amount based on cart total
    const cart = JSON.parse(localStorage.getItem('cart') || '[]');
    const subtotal = cart.reduce((t, i) => t + Number(i.price) * (i.quantity || 1), 0);
    
    let discountAmount = 0;
    if (coupon.type === 'percentage') {
      discountAmount = (subtotal * coupon.value) / 100;
    } else {
      discountAmount = Math.min(coupon.value, subtotal);
    }

    // Prepare detailed cart items with variant information
    const cartItems = cart.map(item => ({
      productId: item.productId,
      productName: item.name,
      variantLabel: item.variantLabel || item.label || 'Default',
      variantPrice: item.price,
      quantity: item.quantity || 1,
      totalPrice: Number(item.price) * (item.quantity || 1)
    }));

    const couponUsageData = {
      couponCode: coupon.code,
      couponId: coupon.id || coupon.code, // Use coupon ID if available, otherwise use code
      orderId: orderId,
      productIds: productIds,
      cartItems: cartItems, // Detailed cart information with variants
      discountAmount: discountAmount,
      discountType: coupon.type,
      usedAt: serverTimestamp(),
      userId: auth.currentUser?.uid || 'anonymous'
    };

    // Add to coupon usage collection
    await addDoc(collection(db, 'couponUsage'), couponUsageData);
    
    // Update coupon usage count in coupons collection
    if (coupon.id) {
      const couponRef = doc(db, 'coupons', coupon.id);
      await updateDoc(couponRef, {
        usageCount: (coupon.usageCount || 0) + 1,
        lastUsedAt: serverTimestamp()
      });
    }
  } catch (error) {
    console.error('Error tracking coupon usage:', error);
    throw error;
  }
}
