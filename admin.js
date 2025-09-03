import { auth, db, storage } from './firebase-config.js';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { collection, doc, getDoc, getDocs, limit, orderBy, query, updateDoc, addDoc, deleteDoc, where, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-storage.js";
import { showToast } from './toast.js';

const paymentsCol = collection(db, 'payments');
const productsCol = collection(db, 'products');
const usersCol = collection(db, 'users');

// Check admin via either admins/{uid}.active or users/{uid}.role == 'admin'
async function isAdmin(uid) {
  if (!uid) return false;
  try {
    // Check admins collection
    try {
      const adminDoc = await getDoc(doc(db, 'admins', uid));
      if (adminDoc.exists() && adminDoc.data()?.active === true) return true;
    } catch {}

    // Check user role
    try {
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (userDoc.exists() && userDoc.data()?.role === 'admin') return true;
    } catch {}

    return false;
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}

// Tab management
function setupTabs() {
  const tabs = document.querySelectorAll('.admin-tab');
  const tabContents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;
      
      // Update active tab
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Show target content
      tabContents.forEach(content => {
        content.classList.remove('active');
        if (content.id === targetTab) {
          content.classList.add('active');
        }
      });
    });
  });
}

// Show specific tab (for programmatic access)
function showTab(tabName) {
  // Hide all tab contents
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  
  // Remove active class from all tabs
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.classList.remove('active');
  });
  
  // Show selected tab content
  const selectedContent = document.getElementById(tabName);
  if (selectedContent) {
    selectedContent.classList.add('active');
  }
  
  // Add active class to selected tab
  const selectedTab = document.querySelector(`[data-tab="${tabName}"]`);
  if (selectedTab) {
    selectedTab.classList.add('active');
  }
}

// Make showTab globally available
window.showTab = showTab;

// Order Details Modal Functions
async function showOrderDetails(paymentId) {
  try {
    const paymentDoc = await getDoc(doc(db, 'payments', paymentId));
    if (!paymentDoc.exists()) {
      showToast('Payment not found', 'error');
      return;
    }

    const paymentData = paymentDoc.data();
    const orderItems = paymentData.orderItems || [];
    
    // Build order details HTML
    let orderDetailsHTML = '';
    
    if (orderItems.length > 0) {
      orderDetailsHTML = orderItems.map(item => {
        const extraFieldsHTML = item.extraFields && item.extraFields.length > 0 
          ? item.extraFields.map(field => `<p><strong>${field.label}:</strong> ${field.value}</p>`).join('')
          : '<p><em>No extra fields</em></p>';
        
        return `
          <div class="order-item">
            <h4>${item.name}</h4>
            <p><strong>Variant:</strong> <span>${item.variant?.label || item.variant?.name || 'N/A'}</span></p>
            <p><strong>Quantity:</strong> <span>${item.quantity || 1}</span></p>
            <p><strong>Price:</strong> <span>Rs ${item.price || 'N/A'}</span></p>
            <p><strong>Total:</strong> <span class="item-total">Rs ${((item.price || 0) * (item.quantity || 1)).toFixed(2)}</span></p>
            <div class="extra-fields">
              <h5>Extra Fields:</h5>
              ${extraFieldsHTML}
            </div>
          </div>
        `;
      }).join('<hr>');
    } else {
      orderDetailsHTML = '<p><em>No order items found</em></p>';
    }

    // Show modal
    const modal = document.getElementById('orderDetailsModal');
    const modalContent = document.getElementById('orderDetailsContent');
    
    if (modal && modalContent) {
      modalContent.innerHTML = `
        <div class="modal-header">
          <h3>Order Details</h3>
          <button class="close-modal" onclick="closeOrderDetailsModal()">&times;</button>
        </div>
        <div class="modal-body">
          <div class="customer-info">
            <h4>Customer Information</h4>
            <p><strong>Name:</strong> ${paymentData.fullName || 'N/A'}</p>
            <p><strong>Email:</strong> ${paymentData.email || 'N/A'}</p>
            <p><strong>Phone:</strong> ${paymentData.phone || 'N/A'}</p>
          </div>
          <div class="order-items">
            <h4>Order Items (${orderItems.length} item${orderItems.length !== 1 ? 's' : ''})</h4>
            ${orderDetailsHTML}
          </div>
          <div class="order-summary">
            <h4>Order Summary</h4>
            <p><strong>Total Items:</strong> ${orderItems.reduce((sum, item) => sum + (item.quantity || 1), 0)}</p>
            <p><strong>Total Amount:</strong> Rs ${paymentData.orderTotal || 'N/A'}</p>
            <p><strong>Payment Method:</strong> ${paymentData.paymentMethod || 'N/A'}</p>
            <p><strong>Order Date:</strong> ${paymentData.createdAt?.toDate?.()?.toLocaleString() || 'N/A'}</p>
          </div>
        </div>
      `;
      
      modal.style.display = 'block';
    }
  } catch (error) {
    console.error('Error loading order details:', error);
    showToast('Failed to load order details', 'error');
  }
}

function closeOrderDetailsModal() {
  const modal = document.getElementById('orderDetailsModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

// Screenshot viewing functions
function viewBase64Image(base64Data, filename) {
  const modal = document.getElementById('orderDetailsModal');
  const modalContent = document.getElementById('orderDetailsContent');
  
  if (modal && modalContent) {
    modalContent.innerHTML = `
      <div class="modal-header">
        <h3>Screenshot: ${filename}</h3>
        <button class="close-modal" onclick="closeOrderDetailsModal()">&times;</button>
      </div>
      <div class="modal-body">
        <div class="screenshot-viewer">
          <img src="${base64Data}" alt="${filename}" style="max-width: 100%; height: auto; border-radius: 10px;">
        </div>
      </div>
    `;
    
    modal.style.display = 'block';
  }
}

// Coupon Management Functions
const couponsCol = collection(db, 'coupons');

async function loadCoupons() {
    const tbody = document.querySelector('#couponsTable tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="9">Loading coupons...</td></tr>';
    
    try {
        const q = query(couponsCol, orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        
        if (snap.empty) {
            tbody.innerHTML = '<tr><td colspan="9">No coupons available.</td></tr>';
            return;
        }
        
        const rows = [];
        snap.forEach(docSnap => {
            const coupon = docSnap.data();
            rows.push(createCouponRow(docSnap.id, coupon));
        });
        
        tbody.dataset.allRows = JSON.stringify(rows);
        tbody.innerHTML = rows.join('');
        
    } catch (error) {
        console.error('Error loading coupons:', error);
        tbody.innerHTML = '<tr><td colspan="9">Failed to load coupons.</td></tr>';
    }
}

function createCouponRow(id, coupon) {
    const status = coupon.isActive ? 'Active' : 'Inactive';
    const statusClass = coupon.isActive ? 'status-active' : 'status-inactive';
    const expiryDate = coupon.expiryDate ? coupon.expiryDate.toDate().toLocaleDateString() : 'No expiry';
    
    return `
        <tr data-id="${id}">
            <td><strong>${coupon.code}</strong></td>
            <td>${coupon.type === 'percentage' ? coupon.value + '%' : 'Rs ' + coupon.value}</td>
            <td>${coupon.type === 'percentage' ? 'Percentage' : 'Fixed Amount'}</td>
            <td>Rs ${coupon.minAmount}</td>
            <td>${coupon.usageLimit}</td>
            <td>${coupon.usedCount || 0}</td>
            <td>${expiryDate}</td>
            <td><span class="status-badge ${statusClass}">${status}</span></td>
            <td class="actions">
                <button class="btn btn-warning btn-sm" onclick="editCoupon('${id}')">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-danger btn-sm" onclick="deleteCoupon('${id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `;
}

function openAddCouponModal() {
    document.getElementById('addCouponModal').style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function closeAddCouponModal() {
    document.getElementById('addCouponModal').style.display = 'none';
    document.body.style.overflow = 'auto';
    document.getElementById('couponForm').reset();
}

// Setup coupon form submission
function setupCouponForm() {
    const couponForm = document.getElementById('couponForm');
    if (couponForm) {
        couponForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = {
                code: document.getElementById('couponCode').value.trim().toUpperCase(),
                type: document.getElementById('couponType').value,
                value: parseFloat(document.getElementById('couponValue').value),
                minAmount: parseFloat(document.getElementById('couponMinAmount').value),
                usageLimit: parseInt(document.getElementById('couponUsageLimit').value),
                expiryDate: new Date(document.getElementById('couponExpiry').value),
                description: document.getElementById('couponDescription').value.trim(),
                isActive: true,
                usedCount: 0,
                createdAt: serverTimestamp()
            };
            
            try {
                // Check if coupon code already exists
                const existingCoupon = await getDoc(doc(db, 'coupons', formData.code));
                if (existingCoupon.exists()) {
                    showToast('Coupon code already exists', 'error');
                    return;
                }
                
                // Create coupon document with code as ID
                await setDoc(doc(db, 'coupons', formData.code), formData);
                
                showToast('Coupon created successfully!', 'success');
                closeAddCouponModal();
                loadCoupons();
                
            } catch (error) {
                console.error('Error creating coupon:', error);
                showToast('Failed to create coupon', 'error');
            }
        });
    }
}

// Make functions globally available
window.showOrderDetails = showOrderDetails;
window.closeOrderDetailsModal = closeOrderDetailsModal;
window.viewBase64Image = viewBase64Image;
window.showToast = showToast;
window.openAddCouponModal = openAddCouponModal;
window.closeAddCouponModal = closeAddCouponModal;

// Payment Management Functions
function statusBadge(status) {
  const cls = status === 'approved' ? 'status-approved'
            : status === 'rejected' ? 'status-rejected'
            : 'status-pending';
  const text = status ? status : 'pending';
  return `<span class="status-badge ${cls}">${text}</span>`;
}

function rowTemplate(id, data) {
  const status = data.status || 'pending';
  
  // Handle screenshot display - support both Cloudflare URLs and base64
  let ss = '-';
  if (data.screenshotUrl) {
    if (data.screenshotUrl === 'MANUAL_VERIFICATION_REQUIRED') {
      // Manual verification required
      ss = `<span class="manual-verification" style="color: #ed8936; font-weight: 600;">
        <i class="fas fa-exclamation-triangle"></i> Manual Verification Required
      </span>`;
    } else if (data.screenshotUrl.startsWith('data:image')) {
      // Base64 image - show in modal
      ss = `<button class="screenshot-link" onclick="viewBase64Image('${data.screenshotUrl}', '${data.screenshotFilename || 'Screenshot'}')">View Base64</button>`;
    } else {
      // Cloudflare URL - direct link
      ss = `<a class="screenshot-link" href="${data.screenshotUrl}" target="_blank">View Screenshot</a>`;
    }
  }
  
  return `
    <tr data-id="${id}">
      <td>${data.fullName || 'Customer'}</td>
      <td>${statusBadge(status)}</td>
      <td class="actions">
        <button class="btn-order-details" onclick="showOrderDetails('${id}')">Order Details</button>
        <button class="btn-approve">Approve</button>
        <button class="btn-reject">Reject</button>
      </td>
      <td>${data.orderTotal || 'N/A'}</td>
      <td>${ss}</td>
    </tr>
  `;
}

async function loadPayments() {
  console.log('loadPayments called');
  const tbody = document.querySelector('#paymentsTable tbody');
  if (!tbody) {
    console.log('No tbody found for paymentsTable');
    return;
  }
  
  console.log('Setting loading message');
  tbody.innerHTML = '<tr><td colspan="5">Loading...</td></tr>';
  
  try {
    console.log('Querying payments collection...');
    const q = query(paymentsCol, orderBy('createdAt', 'desc'), limit(200));
    const snap = await getDocs(q);
    console.log('Payments query result:', snap.size, 'documents');
    
    const rows = [];
    snap.forEach(docSnap => {
      console.log('Processing payment:', docSnap.id, docSnap.data());
      rows.push(rowTemplate(docSnap.id, docSnap.data()));
    });
    
    tbody.dataset.allRows = JSON.stringify(rows);
    if (rows.length > 0) {
      console.log('Rendering', rows.length, 'payment rows');
      tbody.innerHTML = rows.join('');
    } else {
      console.log('No payments found, showing empty message');
      tbody.innerHTML = '<tr><td colspan="5">No payments yet.</td></tr>';
    }
  } catch (err) {
    console.error('Error in loadPayments:', err);
    tbody.innerHTML = '<tr><td colspan="5">Failed to load.</td></tr>';
  }
}

function wirePaymentActions() {
  const table = document.getElementById('paymentsTable');
  if (!table) return;
  
  table.addEventListener('click', async (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const row = target.closest('tr[data-id]');
    if (!row) return;
    const id = row.getAttribute('data-id');
    const ref = doc(db, 'payments', id);
    try {
      if (target.classList.contains('btn-approve')) {
        await updateDoc(ref, { status: 'approved', reviewedAt: new Date() });
        
        // Increment sales count for the products
        try {
          const paymentData = (await getDoc(ref)).data();
          const productIds = paymentData.productIds || [];
          
          for (const productId of productIds) {
            const productRef = doc(db, 'products', productId);
            const productDoc = await getDoc(productRef);
            if (productDoc.exists()) {
              const currentSales = productDoc.data().salesCount || 0;
              await updateDoc(productRef, { salesCount: currentSales + 1 });
            }
          }
        } catch (error) {
          console.error('Error updating sales count:', error);
        }
        
        await loadPayments();
        showToast('Payment approved', 'success');
      }
      if (target.classList.contains('btn-reject')) {
        await updateDoc(ref, { status: 'rejected', reviewedAt: new Date() });
        await loadPayments();
        showToast('Payment rejected', 'success');
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to update status', 'error');
    }
  });
}

// Product Management Functions
async function loadProducts() {
  const productsGrid = document.getElementById('productsGrid');
  if (!productsGrid) return;
  
  try {
    // Get all products and sort by priority and sales count
    const q = query(productsCol);
    const snap = await getDocs(q);
    
    if (snap.empty) {
      productsGrid.innerHTML = '<p class="muted">No products available.</p>';
      return;
    }
    
    // Sort products by priority (high to low) and then by sales count (high to low)
    const products = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })).sort((a, b) => {
      // First sort by priority (4 = Very High, 3 = High, 2 = Normal, 1 = Low)
      const priorityDiff = (b.priority || 2) - (a.priority || 2);
      if (priorityDiff !== 0) return priorityDiff;
      
      // Then sort by sales count (high to low)
      const salesDiff = (b.salesCount || 0) - (a.salesCount || 0);
      return salesDiff;
    });
    
    const productsHTML = products.map(product => {
      const variants = product.variants || [];
      const basePrice = variants.length > 0 ? variants[0].price : 'N/A';
      const priorityText = getPriorityText(product.priority || 2);
      const salesCount = product.salesCount || 0;
      
              return `
        <div class="product-card" data-product-id="${product.id}">
          <div class="product-image">
            ${ (product.imageUrl || product.imagePath) ? 
              `<img src="${product.imageUrl || product.imagePath}" alt="${product.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">` :
              `<i class="fas fa-image" style="font-size: 3rem; color: #667eea;"></i>`
            }
            ${product.featured ? '<div class="featured-badge">Featured</div>' : ''}
            <div class="priority-badge priority-${product.priority || 2}">${priorityText}</div>
          </div>
          <div class="product-info">
            <h3>${product.name}</h3>
            <p class="muted">Digital Product</p>
            <p class="product-price">Rs ${basePrice}</p>
            <p class="muted">${variants.length} variant${variants.length !== 1 ? 's' : ''}</p>
            <p class="sales-info">Sales: ${salesCount}</p>
            <div class="product-actions">
              <button class="btn" onclick="editProduct('${product.id}')">Edit</button>
              <button class="btn" onclick="deleteProduct('${product.id}')" style="background: #ff4757;">Delete</button>
            </div>
          </div>
        </div>
      `;
    }).join('');
    
    productsGrid.innerHTML = productsHTML;
  } catch (error) {
    console.error('Error loading products:', error);
    productsGrid.innerHTML = '<p class="muted">Error loading products.</p>';
  }
}

// Helper function to get priority text
function getPriorityText(priority) {
  switch (priority) {
    case 1: return 'Low';
    case 2: return 'Normal';
    case 3: return 'High';
    case 4: return 'Very High';
    default: return 'Normal';
  }
}

function setupProductForm() {
  const productForm = document.getElementById('productForm');
  const editProductForm = document.getElementById('editProductForm');
  
  if (productForm) {
    productForm.addEventListener('submit', handleProductSubmit);
  }
  
  if (editProductForm) {
    editProductForm.addEventListener('submit', handleEditProductSubmit);
  }
  
  // Setup image upload for edit product form
  const editProductImage = document.getElementById('editProductImage');
  if (editProductImage) {
    editProductImage.addEventListener('change', handleEditImageChange);
  }
  
  // Setup image upload for add product form
  const productImage = document.getElementById('productImage');
  if (productImage) {
    productImage.addEventListener('change', handleImageChange);
  }
}

function addVariant() {
  const container = document.getElementById('variantsContainer');
  if (!container) return;
  
  const variantHTML = `
    <div class="variant-item">
      <div class="variant-grid">
        <div class="form-group">
          <label>Label (e.g. 1000 V-Bucks)</label>
          <input type="text" class="variant-label" placeholder="1000 V-Bucks" required>
        </div>
        <div class="form-group">
          <label>Price (Rs)</label>
          <input type="number" class="variant-price" step="0.01" placeholder="7.99" required>
        </div>
      </div>
      <button type="button" class="remove-variant" onclick="removeVariant(this)">×</button>
    </div>
  `;
  
  container.insertAdjacentHTML('beforeend', variantHTML);
}

function addExtraField() {
  const container = document.getElementById('extraFieldsContainer');
  if (!container) return;
  const id = `extra-${Date.now()}`;
  const html = `
    <div class="extra-item">
      <div class="variant-grid">
        <div class="form-group">
          <label>Field Label</label>
          <input type="text" class="extra-label" placeholder="Free Fire UID" required>
        </div>
        <div class="form-group">
          <label>Placeholder / Hint</label>
          <input type="text" class="extra-placeholder" placeholder="Enter your game UID">
        </div>
        <div class="form-group">
          <label>Required?</label>
          <select class="extra-required">
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </div>
      </div>
      <button type="button" class="remove-variant" onclick="removeExtraField(this)">×</button>
    </div>`;
  container.insertAdjacentHTML('beforeend', html);
}

function addEditVariant() {
  const container = document.getElementById('editVariantsContainer');
  if (!container) return;
  
  const variantHTML = `
    <div class="variant-item">
      <div class="variant-grid">
        <input type="text" class="variant-label" placeholder="Variant name (e.g., 100 Diamonds)" required>
        <input type="number" class="variant-price" placeholder="Price" step="0.01" required>
        <button type="button" class="remove-variant" onclick="removeVariant(this)">×</button>
      </div>
    </div>
  `;
  
  container.insertAdjacentHTML('beforeend', variantHTML);
}

function addEditExtraField() {
  const container = document.getElementById('editExtraFieldsContainer');
  if (!container) return;
  
  const html = `
    <div class="extra-item">
      <div class="variant-grid">
        <input type="text" class="extra-label" placeholder="Field label (e.g., Game ID)" required>
        <input type="text" class="extra-placeholder" placeholder="Placeholder text">
        <select class="extra-required">
          <option value="true">Required</option>
          <option value="false">Optional</option>
        </select>
        <button type="button" class="remove-variant" onclick="removeExtraField(this)">×</button>
      </div>
    </div>`;
  
  container.insertAdjacentHTML('beforeend', html);
}

function removeVariant(element) {
  element.parentElement.remove();
}

function removeExtraField(element) {
  element.parentElement.remove();
}

// Image handling functions
function handleImageChange(e) {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      const imagePreview = document.getElementById('imagePreview');
      const previewImg = document.getElementById('previewImg');
      if (imagePreview && previewImg) {
        previewImg.src = e.target.result;
        imagePreview.style.display = 'block';
      }
    };
    reader.readAsDataURL(file);
  }
}

function handleEditImageChange(e) {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      const editImagePreview = document.getElementById('editImagePreview');
      const editPreviewImg = document.getElementById('editPreviewImg');
      if (editImagePreview && editPreviewImg) {
        editPreviewImg.src = e.target.result;
        editImagePreview.style.display = 'block';
      }
    };
    reader.readAsDataURL(file);
  }
}

// Make these functions globally available
window.removeVariant = removeVariant;
window.removeExtraField = removeExtraField;
window.handleImageChange = handleImageChange;
window.handleEditImageChange = handleEditImageChange;
window.removeEditImagePreview = removeEditImagePreview;
window.addEditVariant = addEditVariant;
window.addEditExtraField = addEditExtraField;
function cancelAddProduct() {
  const addProductForm = document.getElementById('addProductForm');
  const addProductBtn = document.getElementById('addProductBtn');
  const productForm = document.getElementById('productForm');
  
  if (addProductForm) addProductForm.style.display = 'none';
  if (addProductBtn) addProductBtn.style.display = 'block';
  if (productForm) productForm.reset();
  
  // Reset variants to one
  const variantsContainer = document.getElementById('variantsContainer');
  if (variantsContainer) {
    variantsContainer.innerHTML = `
      <div class="variant-item">
        <div class="variant-grid">
          <div class="form-group">
            <label>Label (e.g. 1000 V-Bucks)</label>
            <input type="text" class="variant-label" placeholder="1000 V-Bucks" required>
          </div>
          <div class="form-group">
            <label>Price (Rs)</label>
            <input type="number" class="variant-price" step="0.01" placeholder="7.99" required>
          </div>
        </div>
        <button type="button" class="remove-variant" onclick="removeVariant(this)">×</button>
      </div>
    `;
  }
  
  // Reset extra fields
  const extraFieldsContainer = document.getElementById('extraFieldsContainer');
  if (extraFieldsContainer) {
    extraFieldsContainer.innerHTML = '';
  }
  
  // Reset editing state
  editingProductId = null;
  document.querySelector('#productForm button[type="submit"]').textContent = 'Save Product';
}

// Edit product functionality
let editingProductId = null;

async function editProduct(productId) {
  try {
    console.log('Edit product called with ID:', productId);
    
    const productDoc = await getDoc(doc(db, 'products', productId));
    if (!productDoc.exists()) {
      showToast('Product not found', 'error');
      return;
    }
    
    const product = productDoc.data();
    console.log('Product data loaded:', product);
    
    editingProductId = productId;
    
    // Populate edit form fields
    document.getElementById('editProductId').value = productId;
    document.getElementById('editProductName').value = product.name || '';
    document.getElementById('editProductCategory').value = product.category || '';
    document.getElementById('editProductDescription').value = product.description || '';
    document.getElementById('editProductTags').value = product.tags ? product.tags.join(', ') : '';
    document.getElementById('editProductStatus').value = product.status || 'active';
    document.getElementById('editProductFeatures').value = (product.features || []).join('\n');
    document.getElementById('editFeaturedProduct').checked = product.featured || false;
    document.getElementById('editProductPriority').value = product.priority || '2';
    

    
    // Handle product image
    const editProductImageUrl = document.getElementById('editProductImageUrl');
    const editImagePreview = document.getElementById('editImagePreview');
    const editPreviewImg = document.getElementById('editPreviewImg');
    
    if (editProductImageUrl) {
      editProductImageUrl.value = product.imageUrl || '';
    }
    
    if (editImagePreview && editPreviewImg && product.imageUrl) {
      editPreviewImg.src = product.imageUrl;
      editImagePreview.style.display = 'block';
    } else if (editImagePreview) {
      editImagePreview.style.display = 'none';
    }
    
    // Populate variants
    const variantsContainer = document.getElementById('editVariantsContainer');
    variantsContainer.innerHTML = '';
    
    if (product.variants && product.variants.length > 0) {
      product.variants.forEach(variant => {
        const variantDiv = document.createElement('div');
        variantDiv.className = 'variant-item';
        variantDiv.innerHTML = `
          <div class="variant-grid">
            <input type="text" class="variant-label" placeholder="Variant name (e.g., 100 Diamonds)" value="${variant.label || ''}" required>
            <input type="number" class="variant-price" placeholder="Price" step="0.01" value="${variant.price || ''}" required>
          <button type="button" class="remove-variant" onclick="removeVariant(this)">×</button>
          </div>
        `;
        variantsContainer.appendChild(variantDiv);
      });
    } else {
      // Add default variant if none exist
      addEditVariant();
    }
    
    // Populate extra fields
    const extraFieldsContainer = document.getElementById('editExtraFieldsContainer');
    extraFieldsContainer.innerHTML = '';
    
    if (product.extraFields && product.extraFields.length > 0) {
      product.extraFields.forEach(field => {
        const fieldDiv = document.createElement('div');
        fieldDiv.className = 'extra-item';
        fieldDiv.innerHTML = `
          <div class="variant-grid">
            <input type="text" class="extra-label" placeholder="Field label (e.g., Game ID)" value="${field.label || ''}" required>
            <input type="text" class="extra-placeholder" placeholder="Placeholder text" value="${field.placeholder || ''}">
              <select class="extra-required">
              <option value="true" ${field.required ? 'selected' : ''}>Required</option>
              <option value="false" ${!field.required ? 'selected' : ''}>Optional</option>
              </select>
          <button type="button" class="remove-variant" onclick="removeExtraField(this)">×</button>
          </div>
        `;
        extraFieldsContainer.appendChild(fieldDiv);
      });
    } else {
      // Add default extra field if none exist
      addEditExtraField();
    }
    
    // Show edit modal
    console.log('Opening edit modal...');
    openEditProductModal();
    console.log('Edit modal opened successfully');
    
  } catch (error) {
    console.error('Error loading product for edit:', error);
    showToast('Failed to load product details', 'error');
  }
}

async function handleProductSubmit(e) {
  e.preventDefault();
  
  try {
    const formData = new FormData(e.target);
    const productName = document.getElementById('productName').value;
    const productCategory = document.getElementById('productCategory').value;
    const productDescription = document.getElementById('productDescription').value;
    const productTags = document.getElementById('productTags').value;
    const productStatus = document.getElementById('productStatus').value;
    const productImageInput = document.getElementById('productImage');
    const productImageUrl = document.getElementById('productImageUrl');
    const productFeatures = document.getElementById('productFeatures').value;
    const featuredProduct = document.getElementById('featuredProduct').checked;
    const productPriority = document.getElementById('productPriority').value;
    
    // Handle image upload - support both file upload and URL input
    let imageData = null;
    if (productImageInput.files && productImageInput.files[0]) {
      // File upload - convert to base64
      const file = productImageInput.files[0];
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        showToast('Image file size must be less than 5MB', 'error');
        return;
      }
      
      imageData = await convertFileToBase64(file);
    } else if (productImageUrl && productImageUrl.value.trim()) {
      // URL input
      imageData = productImageUrl.value.trim();
    }
    
    // Collect variants (only within variants container)
    const variantElements = document.querySelectorAll('#variantsContainer .variant-item');
    const variants = [];
    
    variantElements.forEach(variantEl => {
      const label = variantEl.querySelector('.variant-label').value;
      const price = parseFloat(variantEl.querySelector('.variant-price').value);
      
      if (label && price) {
        variants.push({
          label,
          price
        });
      }
    });
    
    if (!productCategory) {
      showToast('Product category is required', 'error');
      return;
    }
    
    if (variants.length === 0) {
      showToast('At least one variant is required', 'error');
      return;
    }

    // Collect extra fields
    const extras = [];
    document.querySelectorAll('#extraFieldsContainer .extra-item').forEach(item => {
      const label = item.querySelector('.extra-label')?.value?.trim();
      const placeholder = item.querySelector('.extra-placeholder')?.value?.trim() || '';
      const required = (item.querySelector('.extra-required')?.value || 'true') === 'true';
      if (label) extras.push({ label, placeholder, required });
    });
    
    // Process features
    const features = productFeatures.split('\n').filter(f => f.trim()).map(f => f.trim());
    
    const productData = {
      name: productName,
      category: productCategory,
      description: productDescription,
      tags: productTags.split(',').map(tag => tag.trim()).filter(tag => tag),
      status: productStatus,
      imagePath: imageData,
      features: features,
      variants: variants,
      extraFields: extras,
      featured: featuredProduct,
      priority: parseInt(productPriority),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    
    console.log('Saving product data:', productData);
    
    if (editingProductId) {
      // Update existing product
      await updateDoc(doc(db, 'products', editingProductId), {
        ...productData,
        updatedAt: serverTimestamp()
      });
      showToast('Product updated successfully!', 'success');
    } else {
      // Add new product
      await addDoc(productsCol, productData);
      showToast('Product added successfully!', 'success');
    }
    
    cancelAddProduct();
    await loadProducts();
    
  } catch (error) {
    console.error('Error adding product:', error);
    showToast('Error adding product', 'error');
  }
}

async function handleEditProductSubmit(e) {
  e.preventDefault();
  
  console.log('Edit product form submitted');
  
  try {
    if (!editingProductId) {
      showToast('No product selected for editing', 'error');
      return;
    }
    
    console.log('Editing product ID:', editingProductId);
    
    const productName = document.getElementById('editProductName').value;
    const productCategory = document.getElementById('editProductCategory').value;
    const productDescription = document.getElementById('editProductDescription').value;
    const productTags = document.getElementById('editProductTags').value;
    const productStatus = document.getElementById('editProductStatus').value;
    const productFeatures = document.getElementById('editProductFeatures').value;
    const featuredProduct = document.getElementById('editFeaturedProduct').checked;
    const productPriority = document.getElementById('editProductPriority').value;
    
    // Handle image update
    let imageUrl = document.getElementById('editProductImageUrl').value.trim();
    const editProductImage = document.getElementById('editProductImage');
    
    if (editProductImage.files[0]) {
      // New image uploaded
      try {
        const file = editProductImage.files[0];
        if (file.size > 5 * 1024 * 1024) {
          showToast('Image file size must be less than 5MB', 'error');
          return;
        }
        imageUrl = await convertFileToBase64(file);
      } catch (error) {
        console.error('Error processing image:', error);
        showToast('Error processing image', 'error');
        return;
      }
    }
    
    console.log('Form values collected:', {
      productName,
      productCategory,
      productDescription,
      productTags,
      productStatus,
      productFeatures,
      featuredProduct,
      productPriority
    });
    
    if (!productCategory) {
      showToast('Product category is required', 'error');
      return;
    }
    
    // Collect variants
    const variantElements = document.querySelectorAll('#editVariantsContainer .variant-item');
    const variants = [];
    
    variantElements.forEach(variantEl => {
      const label = variantEl.querySelector('.variant-label').value;
      const price = parseFloat(variantEl.querySelector('.variant-price').value);
      
      if (label && price) {
        variants.push({
          label,
          price
        });
      }
    });
    
    if (variants.length === 0) {
      showToast('At least one variant is required', 'error');
      return;
    }
    
    // Collect extra fields
    const extras = [];
    document.querySelectorAll('#editExtraFieldsContainer .extra-item').forEach(item => {
      const label = item.querySelector('.extra-label')?.value?.trim();
      const placeholder = item.querySelector('.extra-placeholder')?.value?.trim() || '';
      const required = (item.querySelector('.extra-required')?.value || 'true') === 'true';
      if (label) extras.push({ label, placeholder, required });
    });
    
    // Process features
    const features = productFeatures.split('\n').filter(f => f.trim()).map(f => f.trim());
    
    const productData = {
      name: productName,
      category: productCategory,
      description: productDescription,
      tags: productTags.split(',').map(tag => tag.trim()).filter(tag => tag),
      status: productStatus,
      imageUrl: imageUrl,
      features: features,
      variants: variants,
      extraFields: extras,
      featured: featuredProduct,
      priority: parseInt(productPriority),
      updatedAt: serverTimestamp()
    };
    
    console.log('Updating product data:', productData);
    
    // Update existing product
    await updateDoc(doc(db, 'products', editingProductId), productData);
    showToast('Product updated successfully!', 'success');
    
    closeEditProductModal();
    await loadProducts();
    
  } catch (error) {
    console.error('Error updating product:', error);
    showToast('Error updating product', 'error');
  }
}

// Convert file to base64
function convertFileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Setup image upload functionality
function setupImageUpload() {
  const fileInput = document.getElementById('productImage');
  const urlInput = document.getElementById('productImageUrl');
  const preview = document.getElementById('imagePreview');
  const previewImg = document.getElementById('previewImg');
  const uploadArea = document.querySelector('.image-upload-area');
  
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        if (file.size > 5 * 1024 * 1024) {
          showToast('Image file size must be less than 5MB', 'error');
          return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
          if (previewImg) previewImg.src = e.target.result;
          if (preview) preview.style.display = 'block';
          if (uploadArea) uploadArea.style.display = 'none';
          if (urlInput) urlInput.value = '';
        };
        reader.readAsDataURL(file);
      }
    });
  }
  
  if (urlInput) {
    urlInput.addEventListener('input', (e) => {
      const url = e.target.value.trim();
      if (url && isValidUrl(url)) {
        if (previewImg) previewImg.src = url;
        if (preview) preview.style.display = 'block';
        if (uploadArea) uploadArea.style.display = 'none';
        if (fileInput) fileInput.value = '';
      } else if (!url) {
        if (preview) preview.style.display = 'none';
        if (uploadArea) uploadArea.style.display = 'block';
      }
    });
  }
}

// Remove image preview
function removeImagePreview() {
  const preview = document.getElementById('imagePreview');
  const uploadArea = document.querySelector('.image-upload-area');
  const fileInput = document.getElementById('productImage');
  const urlInput = document.getElementById('productImageUrl');
  
  if (preview) preview.style.display = 'none';
  if (uploadArea) uploadArea.style.display = 'block';
  if (fileInput) fileInput.value = '';
  if (urlInput) urlInput.value = '';
}

// Remove edit image preview
function removeEditImagePreview() {
  const editPreview = document.getElementById('editImagePreview');
  const editFileInput = document.getElementById('editProductImage');
  const editUrlInput = document.getElementById('editProductImageUrl');
  
  if (editPreview) editPreview.style.display = 'none';
  if (editFileInput) editFileInput.value = '';
  if (editUrlInput) editUrlInput.value = '';
}

// Validate URL
function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

async function deleteProduct(productId) {
  if (!confirm('Are you sure you want to delete this product? This action cannot be undone.')) {
    return;
  }
  
  try {
    await deleteDoc(doc(db, 'products', productId));
    showToast('Product deleted successfully', 'success');
    await loadProducts();
  } catch (error) {
    console.error('Error deleting product:', error);
    showToast('Error deleting product', 'error');
  }
}

// User Management Functions
async function ensureUserDocument(userId, userData) {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      // Create user document if it doesn't exist
      await setDoc(userRef, {
        ...userData,
        role: 'user',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      console.log('Created user document for:', userId);
    }
  } catch (error) {
    console.error('Error ensuring user document:', error);
  }
}

async function loadUsers() {
  const tbody = document.querySelector('#usersTable tbody');
  if (!tbody) return;
  
  tbody.innerHTML = '<tr><td colspan="5">Loading...</td></tr>';
  try {
    const q = query(usersCol, orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    const rows = [];
    
    snap.forEach(docSnap => {
      const userData = docSnap.data();
      const created = userData.createdAt?.toDate?.() || new Date(0);
      const dateStr = created.toLocaleDateString();
      const name = `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || 'N/A';
      const email = userData.email || 'N/A';
      const role = userData.role || 'user';
      
      rows.push(`
        <tr data-user-id="${docSnap.id}">
          <td>${name}</td>
          <td>${email}</td>
          <td>
            <select class="role-select" onchange="updateUserRole('${docSnap.id}', this.value)">
              <option value="user" ${role === 'user' ? 'selected' : ''}>User</option>
              <option value="admin" ${role === 'admin' ? 'selected' : ''}>Admin</option>
            </select>
          </td>
          <td>${dateStr}</td>
          <td>
            <button class="btn" onclick="viewUserDetails('${docSnap.id}')">View</button>
          </td>
        </tr>
      `);
    });
    
    tbody.dataset.allRows = JSON.stringify(rows);
    tbody.innerHTML = rows.length ? rows.join('') : '<tr><td colspan="5">No users found.</td></tr>';
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="5">Failed to load users.</td></tr>';
  }
}

async function updateUserRole(userId, newRole) {
  try {
    // Validate the role
    if (!['user', 'admin'].includes(newRole)) {
      showToast('Invalid role selected', 'error');
      return;
    }

    // Debug: Check current user authentication
    const currentUser = auth.currentUser;
    if (!currentUser) {
      showToast('You must be signed in to update user roles', 'error');
      return;
    }

    console.log('Current user:', currentUser.uid);
    console.log('Updating user role for:', userId, 'to:', newRole);

    // Update the user document
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      role: newRole,
      updatedAt: serverTimestamp()
    });
    
    showToast(`User role updated to ${newRole}`, 'success');
    
    // Reload the users table to reflect the change
    setTimeout(() => {
      loadUsers();
    }, 1000);
    
  } catch (error) {
    console.error('Error updating user role:', error);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    
    // Provide more specific error messages
    if (error.code === 'permission-denied') {
      showToast('Permission denied. Check if you have admin rights in Firebase Console.', 'error');
    } else if (error.code === 'not-found') {
      showToast('User document not found', 'error');
    } else if (error.code === 'unavailable') {
      showToast('Firebase service unavailable. Please try again.', 'error');
    } else {
      showToast(`Error updating user role: ${error.message}`, 'error');
    }
  }
}

async function viewUserDetails(userId) {
  try {
    const snap = await getDoc(doc(db, 'users', userId));
    if (!snap.exists()) { showToast('User not found', 'error'); return; }
    const u = snap.data();
    const lines = [
      `Name: ${(u.firstName||'') + ' ' + (u.lastName||'')}`.trim(),
      `Email: ${u.email || 'N/A'}`,
      `Phone: ${u.phone || 'N/A'}`,
      `Role: ${u.role || 'user'}`,
      `Created: ${u.createdAt?.toDate ? u.createdAt.toDate().toLocaleString() : 'N/A'}`
    ];
    showToast(lines.join('\n'), 'info', { timeout: 6000 });
  } catch (e) {
    console.error(e);
    showToast('Failed to load user details', 'error');
  }
}

async function loadContacts() {
  const tbody = document.querySelector('#contactsTable tbody');
  if (!tbody) return;
  
  tbody.innerHTML = '<tr><td colspan="6">Loading...</td></tr>';
  try {
    // Get contacts from localStorage (in real app, this would come from a database)
    const contacts = JSON.parse(localStorage.getItem('contactMessages') || '[]');
    
    if (contacts.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6">No contact messages yet.</td></tr>';
      return;
    }
    
    const rows = contacts.map(contact => {
      const date = new Date(contact.timestamp);
      const dateStr = date.toLocaleString();
      
      return `
        <tr>
          <td>${dateStr}</td>
          <td>${contact.name}</td>
          <td>${contact.email}</td>
          <td>${contact.subject}</td>
          <td>
            <div class="message-preview">
              ${contact.message.length > 50 ? contact.message.substring(0, 50) + '...' : contact.message}
            </div>
          </td>
          <td>
            <button class="btn" onclick="viewContactMessage('${contact.name}', '${contact.email}', '${contact.subject}', '${contact.message.replace(/'/g, "\\'")}', '${dateStr}')">View</button>
          </td>
        </tr>
      `;
    });
    
    tbody.innerHTML = rows.join('');
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="6">Failed to load contacts.</td></tr>';
  }
}

function viewContactMessage(name, email, subject, message, date) {
  const lines = [
    `Date: ${date}`,
    `Name: ${name}`,
    `Email: ${email}`,
    `Subject: ${subject}`,
    `Message: ${message}`
  ];
  showToast(lines.join('\n'), 'info', { timeout: 8000 });
}

// Global functions for onclick handlers
window.addVariant = addVariant;
window.addExtraField = addExtraField;
window.editProduct = editProduct;
window.cancelAddProduct = cancelAddProduct;
window.deleteProduct = deleteProduct;
window.updateUserRole = updateUserRole;
window.viewUserDetails = viewUserDetails;
window.viewContactMessage = viewContactMessage;
window.viewBase64Image = viewBase64Image;
window.openEditProductModal = function() {
  document.getElementById('editProductModal').style.display = 'block';
  document.body.style.overflow = 'hidden';
};
window.closeEditProductModal = function() {
  document.getElementById('editProductModal').style.display = 'none';
  document.body.style.overflow = 'auto';
  // Reset form
  document.getElementById('editProductForm').reset();
  // Clear image preview
  if (document.getElementById('editImagePreview')) {
    document.getElementById('editImagePreview').style.display = 'none';
  }
  // Reset editing product ID
  if (typeof editingProductId !== 'undefined') {
    editingProductId = null;
  }
};

window.addEditVariant = function() {
  const container = document.getElementById('editVariantsContainer');
  if (!container) return;
  
  const variantItem = document.createElement('div');
  variantItem.className = 'variant-item';
  variantItem.innerHTML = `
    <div class="variant-grid">
      <input type="text" class="variant-label" placeholder="Variant name (e.g., 100 Diamonds)" required>
      <input type="number" class="variant-price" placeholder="Price" step="0.01" required>
      <button type="button" class="remove-variant" onclick="removeVariant(this)">×</button>
    </div>
  `;
  container.appendChild(variantItem);
};

window.addEditExtraField = function() {
  const container = document.getElementById('editExtraFieldsContainer');
  if (!container) return;
  
  const extraItem = document.createElement('div');
  extraItem.className = 'extra-item';
  extraItem.innerHTML = `
    <div class="variant-grid">
      <input type="text" class="extra-label" placeholder="Field label (e.g., Game ID)" required>
      <input type="text" class="extra-placeholder" placeholder="Placeholder text">
      <select class="extra-required">
        <option value="true">Required</option>
        <option value="false">Optional</option>
      </select>
      <button type="button" class="remove-variant" onclick="removeExtraField(this)">×</button>
    </div>
  `;
  container.appendChild(extraItem);
};



function setAdminStatus(text) {
  const el = document.getElementById('adminStatus');
  if (el) el.textContent = text;
}

async function requireAdmin() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        // Force Google sign-in for admins
        try {
          const provider = new GoogleAuthProvider();
          await signInWithPopup(auth, provider);
          return; // wait next onAuthStateChanged tick
        } catch (err) {
          console.error(err);
          setAdminStatus('Sign-in required');
          return;
        }
      }
      const allowed = await isAdmin(user.uid);
      if (!allowed) {
        setAdminStatus('Access denied: not an admin');
        resolve(false);
      } else {
        setAdminStatus(`Signed in as admin: ${user.email || user.uid}`);
        resolve(true);
      }
    });
  });
}

// Initialize admin panel functionality
function initializeAdminPanel() {
  console.log('initializeAdminPanel called');
  
  // Setup tabs
  console.log('Setting up tabs...');
  setupTabs();
  
  // Setup image upload functionality
  console.log('Setting up image upload...');
  setupImageUpload();
  
  // Setup payment management
  console.log('Setting up payment management...');
  loadPayments();
  wirePaymentActions();
  document.getElementById('refreshBtn')?.addEventListener('click', loadPayments);
  const paymentsSearch = document.getElementById('searchPaymentsInput');
  if (paymentsSearch) {
    paymentsSearch.addEventListener('input', () => {
      const tbody = document.querySelector('#paymentsTable tbody');
      const q = paymentsSearch.value.trim().toLowerCase();
      const all = JSON.parse(tbody?.dataset?.allRows || '[]');
      if (!q) { tbody.innerHTML = all.join(''); return; }
      const filtered = all.filter(html => html.toLowerCase().includes(q));
      tbody.innerHTML = filtered.length ? filtered.join('') : '<tr><td colspan="5">No matches.</td></tr>';
    });
  }
  
  // Setup product management
  console.log('Setting up product management...');
  loadProducts();
  setupProductForm();
  document.getElementById('refreshProductsBtn')?.addEventListener('click', loadProducts);
  
      // Setup user management
    console.log('Setting up user management...');
    loadUsers();
    document.getElementById('refreshUsersBtn')?.addEventListener('click', loadUsers);
    const usersSearch = document.getElementById('searchUsersInput');
    if (usersSearch) {
        usersSearch.addEventListener('input', () => {
            const tbody = document.querySelector('#usersTable tbody');
            const q = usersSearch.value.trim().toLowerCase();
            const all = JSON.parse(tbody?.dataset?.allRows || '[]');
            if (!q) { tbody.innerHTML = all.join(''); return; }
            const filtered = all.filter(html => html.toLowerCase().includes(q));
            tbody.innerHTML = filtered.length ? filtered.join('') : '<tr><td colspan="5">No matches.</td></tr>';
        });
    }
    
    // Setup coupon management
    console.log('Setting up coupon management...');
    loadCoupons();
    setupCouponForm();
    document.getElementById('refreshCouponsBtn')?.addEventListener('click', loadCoupons);
    const couponsSearch = document.getElementById('searchCouponsInput');
    if (couponsSearch) {
        couponsSearch.addEventListener('input', () => {
            const tbody = document.querySelector('#couponsTable tbody');
            const q = couponsSearch.value.trim().toLowerCase();
            const all = JSON.parse(tbody?.dataset?.allRows || '[]');
            if (!q) { tbody.innerHTML = all.join(''); return; }
            const filtered = all.filter(html => html.toLowerCase().includes(q));
            tbody.innerHTML = filtered.length ? filtered.join('') : '<tr><td colspan="9">No matches.</td></tr>';
        });
    }
    
    // Setup contact management
    console.log('Setting up contact management...');
    loadContacts();
    document.getElementById('refreshContactsBtn')?.addEventListener('click', loadContacts);
  
  console.log('Admin panel initialization complete');
}

// Show access denied message
function showAccessDenied() {
  const container = document.querySelector('.admin-container');
  if (container) {
    container.innerHTML = `
      <div style="text-align: center; padding: 50px;">
        <h2>Access Denied</h2>
        <p>You don't have admin privileges to access this page.</p>
        <button onclick="window.location.href='index.html'" class="btn">Go Home</button>
      </div>
    `;
  }
}

// Show login prompt
function showLoginPrompt() {
  const container = document.querySelector('.admin-container');
  if (container) {
    container.innerHTML = `
      <div style="text-align: center; padding: 50px;">
        <h2>Authentication Required</h2>
        <p>Please log in to access the admin panel.</p>
        <button onclick="window.location.href='login.html'" class="btn">Login</button>
      </div>
    `;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  console.log('Admin panel initializing...');
  
  // Check authentication
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      console.log('User authenticated:', user.email);
      const adminStatus = await isAdmin(user.uid);
      if (adminStatus) {
        console.log('Admin access granted');
        initializeAdminPanel();
      } else {
        console.log('Admin access denied');
        showAccessDenied();
      }
    } else {
      console.log('No user authenticated');
      showLoginPrompt();
    }
  });
});


