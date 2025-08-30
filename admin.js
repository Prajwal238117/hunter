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

// Payment Management Functions
function statusBadge(status) {
  const cls = status === 'approved' ? 'status-approved'
            : status === 'rejected' ? 'status-rejected'
            : 'status-pending';
  const text = status ? status : 'pending';
  return `<span class="status-badge ${cls}">${text}</span>`;
}

function rowTemplate(id, data) {
  const created = data.createdAt?.toDate?.() || new Date(0);
  const dateStr = created.toLocaleString();
  const contact = `${data.email || ''}<br/><span class="muted">${data.phone || ''}</span>`;
  const billing = `${data.fullName || ''}<br/><span class="muted">${data.address || ''}, ${data.city || ''}, ${data.state || ''} ${data.zipCode || ''}, ${data.country || ''}</span>`;
  const pay = `${data.paymentMethod || ''}<br/><strong>${data.orderTotal || ''}</strong>`;
  
  // Handle screenshot display - support both Cloudflare URLs and base64
  let ss = '-';
  if (data.screenshotUrl) {
    if (data.screenshotUrl.startsWith('data:image')) {
      // Base64 image - show in modal
      ss = `<button class="screenshot-link" onclick="viewBase64Image('${data.screenshotUrl}', '${data.screenshotFilename || 'Screenshot'}')">View Base64</button>`;
    } else {
      // Cloudflare URL - direct link
      ss = `<a class="screenshot-link" href="${data.screenshotUrl}" target="_blank">View Cloudflare</a>`;
    }
  }
  
  const status = data.status || 'pending';
  return `
    <tr data-id="${id}">
      <td>${dateStr}</td>
      <td>${contact}</td>
      <td>${billing}</td>
      <td>${pay}</td>
      <td>${ss}</td>
      <td>${statusBadge(status)}</td>
      <td class="actions">
        <button class="btn-approve">Approve</button>
        <button class="btn-reject">Reject</button>
      </td>
    </tr>
  `;
}

async function loadPayments() {
  const tbody = document.querySelector('#paymentsTable tbody');
  if (!tbody) return;
  
  tbody.innerHTML = '<tr><td colspan="8">Loading...</td></tr>';
  try {
    const q = query(paymentsCol, orderBy('createdAt', 'desc'), limit(200));
    const snap = await getDocs(q);
    const rows = [];
    snap.forEach(docSnap => rows.push(rowTemplate(docSnap.id, docSnap.data())));
    tbody.dataset.allRows = JSON.stringify(rows);
    tbody.innerHTML = rows.length ? rows.join('') : '<tr><td colspan="8">No payments yet.</td></tr>';
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="8">Failed to load.</td></tr>';
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
    const q = query(productsCol, orderBy('name'));
    const snap = await getDocs(q);
    
    if (snap.empty) {
      productsGrid.innerHTML = '<p class="muted">No products available.</p>';
      return;
    }
    
    const productsHTML = snap.docs.map(doc => {
      const product = doc.data();
      const variants = product.variants || [];
      const basePrice = variants.length > 0 ? variants[0].price : 'N/A';
      
      return `
        <div class="product-card" data-product-id="${doc.id}">
          <div class="product-image">
            ${ (product.imageUrl || product.imagePath) ? 
              `<img src="${product.imageUrl || product.imagePath}" alt="${product.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">` :
              `<i class="fas fa-image" style="font-size: 3rem; color: #667eea;"></i>`
            }
          </div>
          <div class="product-info">
            <h3>${product.name}</h3>
            <p class="muted">Digital Product</p>
            <p class="product-price">Rs ${basePrice}</p>
            <p class="muted">${variants.length} variant${variants.length !== 1 ? 's' : ''}</p>
            <div class="product-actions">
              <button class="btn" onclick="editProduct('${doc.id}')">Edit</button>
              <button class="btn" onclick="deleteProduct('${doc.id}')" style="background: #ff4757;">Delete</button>
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

function setupProductForm() {
  const productForm = document.getElementById('productForm');
  
  if (productForm) {
    productForm.addEventListener('submit', handleProductSubmit);
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

function removeVariant(element) {
  element.parentElement.remove();
}

function removeExtraField(element) {
  element.parentElement.remove();
}
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
    const productDoc = await getDoc(doc(db, 'products', productId));
    if (!productDoc.exists()) {
      showToast('Product not found', 'error');
      return;
    }
    
    const product = productDoc.data();
    editingProductId = productId;
    
    // Populate form fields
    document.getElementById('productName').value = product.name || '';
            // Category field removed - no longer needed
    document.getElementById('productDescription').value = product.description || '';
    document.getElementById('productImage').value = product.imageUrl || product.imagePath || '';
    document.getElementById('productFeatures').value = (product.features || []).join('\n');
    
    // Populate variants
    const variantsContainer = document.getElementById('variantsContainer');
    variantsContainer.innerHTML = '';
    
    if (product.variants && product.variants.length > 0) {
      product.variants.forEach(variant => {
        const variantDiv = document.createElement('div');
        variantDiv.className = 'variant-item';
        variantDiv.innerHTML = `
          <div class="variant-grid">
            <div class="form-group">
              <label>Label (e.g. 1000 V-Bucks)</label>
              <input type="text" class="variant-label" value="${variant.label || ''}" required>
            </div>
            <div class="form-group">
              <label>Price (Rs)</label>
              <input type="number" class="variant-price" step="0.01" value="${variant.price || ''}" required>
            </div>
          </div>
          <button type="button" class="remove-variant" onclick="removeVariant(this)">×</button>
        `;
        variantsContainer.appendChild(variantDiv);
      });
    } else {
      // Add default variant if none exist
      addVariant();
    }
    
    // Populate extra fields
    const extraFieldsContainer = document.getElementById('extraFieldsContainer');
    extraFieldsContainer.innerHTML = '';
    
    if (product.extraFields && product.extraFields.length > 0) {
      product.extraFields.forEach(field => {
        const fieldDiv = document.createElement('div');
        fieldDiv.className = 'extra-item';
        fieldDiv.innerHTML = `
          <div class="variant-grid">
            <div class="form-group">
              <label>Field Label</label>
              <input type="text" class="extra-label" value="${field.label || ''}" required>
            </div>
            <div class="form-group">
              <label>Placeholder / Hint</label>
              <input type="text" class="extra-placeholder" value="${field.placeholder || ''}" required>
            </div>
            <div class="form-group">
              <label>Required?</label>
              <select class="extra-required">
                <option value="true" ${field.required ? 'selected' : ''}>Yes</option>
                <option value="false" ${!field.required ? 'selected' : ''}>No</option>
              </select>
            </div>
          </div>
          <button type="button" class="remove-variant" onclick="removeExtraField(this)">×</button>
        `;
        extraFieldsContainer.appendChild(fieldDiv);
      });
    }
    
    // Show form and update button text
    document.getElementById('addProductForm').style.display = 'block';
    document.getElementById('addProductBtn').style.display = 'none';
    document.querySelector('#productForm button[type="submit"]').textContent = 'Update Product';
    
    // Scroll to form
    document.getElementById('addProductForm').scrollIntoView({ behavior: 'smooth' });
    
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
          // Category field removed - no longer needed
    const productDescription = document.getElementById('productDescription').value;
    const productImageInput = document.getElementById('productImage');
    const productImageUrl = document.getElementById('productImageUrl');
    const productFeatures = document.getElementById('productFeatures').value;
    
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
              // Category field removed - no longer needed
      description: productDescription,
      imagePath: imageData,
      features: features,
      variants: variants,
      extraFields: extras,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    
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
    
    // Provide more specific error messages
    if (error.code === 'permission-denied') {
      showToast('Permission denied. You may not have admin rights.', 'error');
    } else if (error.code === 'not-found') {
      showToast('User document not found', 'error');
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
window.editProduct = function(productId) {
  showToast('Edit product - coming soon', 'info');
};

function viewBase64Image(base64Data, filename) {
  // Create a modal to display the base64 image
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;
  
  modal.innerHTML = `
    <div style="background: white; padding: 20px; border-radius: 10px; max-width: 90%; max-height: 90%; overflow: auto;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
        <h3>${filename}</h3>
        <button onclick="this.closest('div[style*=\'position: fixed\']').remove()" style="background: none; border: none; font-size: 24px; cursor: pointer;">×</button>
      </div>
      <img src="${base64Data}" style="max-width: 100%; height: auto;" alt="${filename}">
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Close modal when clicking outside
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

// Make viewBase64Image globally available
window.viewBase64Image = viewBase64Image;

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
  // Setup tabs
  setupTabs();
  
  // Setup image upload functionality
  setupImageUpload();
  
  // Setup payment management
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
      tbody.innerHTML = filtered.length ? filtered.join('') : '<tr><td colspan="7">No matches.</td></tr>';
    });
  }
  
  // Setup product management
  loadProducts();
  setupProductForm();
  document.getElementById('refreshProductsBtn')?.addEventListener('click', loadProducts);
  
  // Setup user management
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
  
  // Setup contact management
  loadContacts();
  document.getElementById('refreshContactsBtn')?.addEventListener('click', loadContacts);
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


