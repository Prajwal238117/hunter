import { auth, db, storage } from './firebase-config.js';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { collection, doc, getDoc, getDocs, limit, orderBy, query, updateDoc, addDoc, deleteDoc, where, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-storage.js";
import { showToast } from './toast.js';

const paymentsCol = collection(db, 'payments');
const productsCol = collection(db, 'products');
const usersCol = collection(db, 'users');
const promotersCol = collection(db, 'promoters');

// Check admin via either admins/{uid}.active or users/{uid}.role == 'admin'
// Setup admin account in new database
async function setupAdminAccount() {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      showToast('Please log in first', 'error');
      return;
    }

    console.log('Setting up admin account for:', currentUser.email);
    
    // Create user document with admin role
    const userData = {
      firstName: 'Admin',
      lastName: 'User',
      email: currentUser.email,
      phone: '',
      role: 'admin',
      status: 'active',
      balance: 0,
      profitPercentage: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: 'system'
    };

    // Check if user document already exists
    const userRef = doc(db, 'users', currentUser.uid);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      // Update existing user to admin
      await updateDoc(userRef, {
        role: 'admin',
        updatedAt: serverTimestamp()
      });
      console.log('Updated existing user to admin role');
    } else {
      // Create new user document
      await addDoc(collection(db, 'users'), {
        ...userData,
        uid: currentUser.uid
      });
      console.log('Created new admin user document');
    }

    // Also create admin document in admins collection
    const adminData = {
      active: true,
      email: currentUser.email,
      createdAt: serverTimestamp(),
      createdBy: 'system'
    };

    const adminRef = doc(db, 'admins', currentUser.uid);
    const adminDoc = await getDoc(adminRef);
    
    if (adminDoc.exists()) {
      // Update existing admin document
      await updateDoc(adminRef, {
        active: true,
        updatedAt: serverTimestamp()
      });
      console.log('Updated existing admin document');
    } else {
      // Create new admin document
      await addDoc(collection(db, 'admins'), {
        ...adminData,
        uid: currentUser.uid
      });
      console.log('Created new admin document');
    }

    showToast('Admin account setup complete! Please refresh the page.', 'success');
    
    // Refresh the page after 2 seconds
    setTimeout(() => {
      window.location.reload();
    }, 2000);

  } catch (error) {
    console.error('Error setting up admin account:', error);
    showToast(`Error setting up admin account: ${error.message}`, 'error');
  }
}

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

  // Load data for specific tabs
  if (tabName === 'wallet-topups') {
    loadWalletTopups();
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
          <div class="order-items">
            <h4><i class="fas fa-shopping-cart"></i> Order Items (${orderItems.length} item${orderItems.length !== 1 ? 's' : ''})</h4>
            ${orderDetailsHTML}
          </div>
          <div class="order-summary">
            <h4><i class="fas fa-receipt"></i> Order Summary</h4>
            <p><strong>Total Items:</strong> ${orderItems.reduce((sum, item) => sum + (item.quantity || 1), 0)}</p>
            <p><strong>Total Amount:</strong> ${paymentData.orderTotal || 'N/A'}</p>
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
    // Truncate filename if too long for mobile
    const truncatedFilename = filename.length > 30 ? filename.substring(0, 27) + '...' : filename;
    
    modalContent.innerHTML = `
      <div class="modal-header">
        <h3 title="${filename}">Screenshot: ${truncatedFilename}</h3>
        <button class="close-modal" onclick="closeOrderDetailsModal()">&times;</button>
      </div>
      <div class="modal-body">
        <div class="screenshot-viewer">
          <img src="${base64Data}" alt="${filename}" style="max-width: 100%; height: auto; border-radius: 10px;">
          <p style="margin-top: 0.5rem; font-size: 0.8rem; color: #666; word-break: break-all;">${filename}</p>
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
        
        // Get coupon usage data
        const couponUsageData = await getCouponUsageData();
        
        const rows = [];
        snap.forEach(docSnap => {
            const coupon = docSnap.data();
            // Count actual usage from couponUsage collection
            const actualUsageCount = couponUsageData.filter(usage => 
                usage.couponCode === coupon.code || usage.couponId === docSnap.id
            ).length;
            
            rows.push(createCouponRow(docSnap.id, coupon, actualUsageCount));
        });
        
        tbody.dataset.allRows = JSON.stringify(rows);
        tbody.innerHTML = rows.join('');
        
    } catch (error) {
        console.error('Error loading coupons:', error);
        tbody.innerHTML = '<tr><td colspan="9">Failed to load coupons.</td></tr>';
    }
}

function createCouponRow(id, coupon, actualUsageCount = 0) {
    const status = coupon.isActive ? 'Active' : 'Inactive';
    const statusClass = coupon.isActive ? 'status-active' : 'status-inactive';
    const expiryDate = coupon.expiryDate ? coupon.expiryDate.toDate().toLocaleDateString() : 'No expiry';
    
    // Use actual usage count from couponUsage collection
    const usageCount = actualUsageCount || 0;
    const usageLimit = coupon.usageLimit || 'Unlimited';
    
    // Add visual indicator if usage is approaching limit and make it clickable
    let usageDisplay = usageCount;
    let usageClass = '';
    
    if (usageLimit !== 'Unlimited' && usageCount > 0) {
        const limit = parseInt(usageLimit);
        const percentage = (usageCount / limit) * 100;
        if (percentage >= 90) {
            usageClass = 'coupon-usage-high';
        } else if (percentage >= 75) {
            usageClass = 'coupon-usage-warning';
        }
    }
    
    // Make usage count clickable if there are usages
    if (usageCount > 0) {
        usageDisplay = `<span class="coupon-usage-count ${usageClass}" onclick="showCouponUsageDetails('${coupon.code}')" title="Click to view usage details">${usageCount}</span>`;
    }
    
    return `
        <tr data-id="${id}">
            <td><strong>${coupon.code}</strong></td>
            <td>${coupon.type === 'percentage' ? coupon.value + '%' : 'Rs ' + coupon.value}</td>
            <td>${coupon.type === 'percentage' ? 'Percentage' : 'Fixed Amount'}</td>
            <td>Rs ${coupon.minAmount}</td>
            <td>${usageLimit}</td>
            <td>${usageDisplay}</td>
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

// Edit Coupon Functions
async function editCoupon(couponId) {
    try {
        const couponDoc = await getDoc(doc(db, 'coupons', couponId));
        if (!couponDoc.exists()) {
            showToast('Coupon not found', 'error');
            return;
        }
        
        const coupon = couponDoc.data();
        
        // Populate edit form fields
        document.getElementById('editCouponId').value = couponId;
        document.getElementById('editCouponCode').value = coupon.code || '';
        document.getElementById('editCouponType').value = coupon.type || 'percentage';
        document.getElementById('editCouponValue').value = coupon.value || '';
        document.getElementById('editCouponMinAmount').value = coupon.minAmount || '';
        document.getElementById('editCouponUsageLimit').value = coupon.usageLimit || '';
        document.getElementById('editCouponExpiry').value = coupon.expiryDate ? 
            coupon.expiryDate.toDate().toISOString().slice(0, 16) : '';
        document.getElementById('editCouponDescription').value = coupon.description || '';
        document.getElementById('editCouponStatus').value = coupon.isActive ? 'active' : 'inactive';
        
        // Show edit modal
        openEditCouponModal();
        
    } catch (error) {
        console.error('Error loading coupon for edit:', error);
        showToast('Failed to load coupon details', 'error');
    }
}

async function deleteCoupon(couponId) {
    if (!confirm('Are you sure you want to delete this coupon? This action cannot be undone.')) {
        return;
    }
    
    try {
        await deleteDoc(doc(db, 'coupons', couponId));
        showToast('Coupon deleted successfully', 'success');
        loadCoupons();
    } catch (error) {
        console.error('Error deleting coupon:', error);
        showToast('Error deleting coupon', 'error');
    }
}

// Edit Coupon Modal Functions
function openEditCouponModal() {
    document.getElementById('editCouponModal').style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function closeEditCouponModal() {
    document.getElementById('editCouponModal').style.display = 'none';
    document.body.style.overflow = 'auto';
    document.getElementById('editCouponForm').reset();
}

function deleteCouponFromEdit() {
    const couponId = document.getElementById('editCouponId').value;
    if (couponId) {
        closeEditCouponModal();
        deleteCoupon(couponId);
    }
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
    
    // Setup edit coupon form submission
    const editCouponForm = document.getElementById('editCouponForm');
    if (editCouponForm) {
        editCouponForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const couponId = document.getElementById('editCouponId').value;
            if (!couponId) {
                showToast('Coupon ID not found', 'error');
                return;
            }
            
            const formData = {
                code: document.getElementById('editCouponCode').value.trim().toUpperCase(),
                type: document.getElementById('editCouponType').value,
                value: parseFloat(document.getElementById('editCouponValue').value),
                minAmount: parseFloat(document.getElementById('editCouponMinAmount').value),
                usageLimit: parseInt(document.getElementById('editCouponUsageLimit').value),
                expiryDate: new Date(document.getElementById('editCouponExpiry').value),
                description: document.getElementById('editCouponDescription').value.trim(),
                isActive: document.getElementById('editCouponStatus').value === 'active',
                updatedAt: serverTimestamp()
            };
            
            try {
                // Check if coupon code already exists (excluding current coupon)
                if (formData.code !== couponId) {
                    const existingCoupon = await getDoc(doc(db, 'coupons', formData.code));
                    if (existingCoupon.exists()) {
                        showToast('Coupon code already exists', 'error');
                        return;
                    }
                }
                
                // Update coupon document
                await updateDoc(doc(db, 'coupons', couponId), formData);
                
                showToast('Coupon updated successfully!', 'success');
                closeEditCouponModal();
                loadCoupons();
                
            } catch (error) {
                console.error('Error updating coupon:', error);
                showToast('Failed to update coupon', 'error');
            }
        });
    }
}

// Profit Distribution Functions
async function distributeProfit(paymentId, paymentData) {
  try {
    console.log('Starting profit distribution for payment:', paymentId);
    
    // Check admin status first
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('User not authenticated');
    }
    
    const adminStatus = await isAdmin(currentUser.uid);
    console.log('Admin status check:', { uid: currentUser.uid, isAdmin: adminStatus });
    
    if (!adminStatus) {
      throw new Error('User is not an admin');
    }
    
    // Calculate total profit as orderTotal - sum of CPs
    let totalCost = 0;
    const orderItems = paymentData.orderItems || [];
    
    for (const item of orderItems) {
      // Get product data to find CP
      if (item.productId) {
        console.log('Reading product:', item.productId);
        const productRef = doc(db, 'products', item.productId);
        const productDoc = await getDoc(productRef);
        
        if (productDoc.exists()) {
          const product = productDoc.data();
          const variants = product.variants || [];
          
          // Find matching variant
          const variant = variants.find(v => 
            v.label === item.variant?.label || 
            v.label === item.variantLabel ||
            v.price === item.price
          );
          
          if (variant && typeof variant.cp === 'number') {
            const itemCost = (variant.cp) * (item.quantity || 1);
            totalCost += itemCost;
            console.log(`Item cost: ${item.name} - Rs ${itemCost} (CP: ${variant.cp})`);
          } else {
            console.log(`No CP found for item ${item.name}, skipping cost accumulation.`);
          }
        }
      }
    }
    
    // Sanitize orderTotal to handle strings like "Rs 123.45" or formatted numbers
    const parsedOrderTotal = (typeof paymentData.orderTotal === 'number')
      ? paymentData.orderTotal
      : parseFloat(String(paymentData.orderTotal || '0').replace(/[^0-9.]/g, '')) || 0;

    if (!isFinite(totalCost)) totalCost = 0;
    const orderTotal = isFinite(parsedOrderTotal) ? parsedOrderTotal : 0;
    const totalProfit = Math.max(0, orderTotal - totalCost);
    const finalProfit = totalProfit; // orderTotal is already net of discounts/vouchers
    console.log('Order total:', orderTotal);
    console.log('Total cost (sum of CPs):', totalCost);
    console.log('Final profit (orderTotal - totalCost):', finalProfit);
    
    if (finalProfit <= 0) {
      console.log('No profit to distribute after voucher deduction');
      return;
    }
    
    // Get all users with their profit percentages
    console.log('Reading users collection...');
    const usersQuery = query(collection(db, 'users'));
    const usersSnap = await getDocs(usersQuery);
    
    if (usersSnap.empty) {
      console.log('No users found for profit distribution');
      return;
    }
    
    console.log(`Found ${usersSnap.size} users for profit distribution`);
    
    const profitDistributions = [];
    
    // Distribute profit to each user
    for (const userDoc of usersSnap.docs) {
      const userData = userDoc.data();
      const userId = userDoc.id;
      const profitPercentage = parseFloat(userData.profitPercentage) || 0;
      
      if (profitPercentage > 0) {
        let userProfit = (finalProfit * profitPercentage) / 100;
        if (!isFinite(userProfit) || userProfit < 0) userProfit = 0;
        const currentBalance = parseFloat(userData.balance) || 0;
        const newBalance = isFinite(currentBalance + userProfit) ? (currentBalance + userProfit) : currentBalance;
        
        console.log(`Updating user ${userId} balance: ${currentBalance} -> ${newBalance}`);
        
        // Update user balance in main database
        try {
          await updateDoc(doc(db, 'users', userId), {
            balance: newBalance,
            updatedAt: serverTimestamp()
          });
          console.log(`Successfully updated user ${userId}`);
        } catch (updateError) {
          console.error(`Failed to update user ${userId}:`, updateError);
          throw updateError; // Re-throw to be caught by outer try-catch
        }
        
        // Add wallet transaction for profit
        try {
          await addDoc(collection(db, 'walletTransactions'), {
            userId: userId,
            type: 'profit_distribution',
            amount: userProfit,
            balance: newBalance,
            description: `Profit distribution from payment ${paymentId}`,
            paymentId: paymentId,
            profitPercentage: profitPercentage,
            createdAt: serverTimestamp()
          });
          console.log(`Successfully added wallet transaction for user ${userId}`);
        } catch (transactionError) {
          console.error(`Failed to add wallet transaction for user ${userId}:`, transactionError);
          throw transactionError; // Re-throw to be caught by outer try-catch
        }
        
        profitDistributions.push({
          userId,
          userName: userData.name || userData.email || 'Unknown',
          profitPercentage,
          profitAmount: userProfit,
          newBalance
        });
        
        console.log(`Distributed Rs ${userProfit} to ${userData.name || userId} (${profitPercentage}%)`);
      }
    }
    
    // Log profit distribution
    await addDoc(collection(db, 'profitDistributions'), {
      paymentId,
      orderTotal: paymentData.orderTotal,
      totalProfit,
      voucherAmount: 0,
      finalProfit,
      distributions: profitDistributions,
      distributedAt: serverTimestamp(),
      distributedBy: 'admin'
    });
    
    console.log('Profit distribution completed successfully');
    showToast(`Profit distributed: Rs ${finalProfit.toFixed(2)}`, 'success');
    
  } catch (error) {
    console.error('Error distributing profit:', error);
    showToast('Error distributing profit', 'error');
  }
}

// Payment status management
async function updatePaymentStatus(paymentId, newStatus) {
  try {
    const ref = doc(db, 'payments', paymentId);
    await updateDoc(ref, { 
      status: newStatus, 
      reviewedAt: new Date() 
    });
    
    // Increment sales count for the products if approved
    if (newStatus === 'approved') {
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
        
        // Distribute profit when payment is approved
        await distributeProfit(paymentId, paymentData);
        
      } catch (error) {
        console.error('Error updating sales count or distributing profit:', error);
      }
    }
    
    await loadPayments();
    showToast(`Payment status updated to ${newStatus}`, 'success');
  } catch (error) {
    console.error('Error updating payment status:', error);
    showToast('Error updating payment status', 'error');
  }
}

// Profit Deduction Functions
async function deductProfit(paymentId, paymentData) {
  try {
    console.log('Starting profit deduction for cancelled payment:', paymentId);
    
    // Check if profit was distributed for this payment
    const distributionQuery = query(
      collection(db, 'profitDistributions'),
      where('paymentId', '==', paymentId)
    );
    const distributionSnap = await getDocs(distributionQuery);
    
    if (distributionSnap.empty) {
      console.log('No profit distribution found for this payment');
      return;
    }
    
    const distributionData = distributionSnap.docs[0].data();
    const distributions = distributionData.distributions || [];
    
    if (distributions.length === 0) {
      console.log('No distributions to deduct');
      return;
    }
    
    const profitDeductions = [];
    
    // Deduct profit from each user
    for (const dist of distributions) {
      const userId = dist.userId;
      const profitAmount = dist.profitAmount || 0;
      
      if (profitAmount > 0) {
        // Get current user data
        const userRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userRef);
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const currentBalance = userData.balance || 0;
          
          // Calculate new balance (deduct the profit)
          const newBalance = Math.max(0, currentBalance - profitAmount);
          
          // Update user balance in main database
          await updateDoc(userRef, {
            balance: newBalance,
            updatedAt: serverTimestamp()
          });
          
          // Add wallet transaction for profit deduction
          await addDoc(collection(db, 'walletTransactions'), {
            userId: userId,
            type: 'profit_deduction',
            amount: -profitAmount, // Negative amount for deduction
            balance: newBalance,
            description: `Profit deduction from cancelled payment ${paymentId}`,
            paymentId: paymentId,
            profitPercentage: dist.profitPercentage,
            createdAt: serverTimestamp()
          });
          
          profitDeductions.push({
            userId,
            userName: dist.userName,
            profitPercentage: dist.profitPercentage,
            profitAmount: profitAmount,
            previousBalance: currentBalance,
            newBalance: newBalance
          });
          
          console.log(`Deducted Rs ${profitAmount} from ${dist.userName} (${dist.profitPercentage}%)`);
        }
      }
    }
    
    // Log profit deduction
    await addDoc(collection(db, 'profitDeductions'), {
      paymentId,
      originalDistributionId: distributionSnap.docs[0].id,
      orderTotal: paymentData.orderTotal,
      totalProfitDeducted: distributionData.finalProfit,
      deductions: profitDeductions,
      deductedAt: serverTimestamp(),
      deductedBy: 'admin',
      reason: 'Order cancelled'
    });
    
    console.log('Profit deduction completed successfully');
    showToast(`Profit deducted: Rs ${distributionData.finalProfit.toFixed(2)}`, 'success');
    
  } catch (error) {
    console.error('Error deducting profit:', error);
    showToast('Error deducting profit', 'error');
    }
}

// Order status management
async function updateOrderStatus(paymentId, newStatus) {
  try {
    const ref = doc(db, 'payments', paymentId);
    const paymentData = (await getDoc(ref)).data();
    
    await updateDoc(ref, { 
      orderStatus: newStatus, 
      orderStatusUpdatedAt: new Date() 
    });
    
    // If order is cancelled and payment was approved, deduct profit
    if (newStatus === 'cancelled' && paymentData.status === 'approved') {
      await deductProfit(paymentId, paymentData);
    }
    
    await loadPayments();
    showToast(`Order status updated to ${newStatus}`, 'success');
  } catch (error) {
    console.error('Error updating order status:', error);
    showToast('Error updating order status', 'error');
  }
}

// Manual profit distribution function
async function manualProfitDistribution(paymentId) {
  try {
    const paymentRef = doc(db, 'payments', paymentId);
    const paymentDoc = await getDoc(paymentRef);
    
    if (!paymentDoc.exists()) {
      showToast('Payment not found', 'error');
      return;
    }
    
    const paymentData = paymentDoc.data();
    
    if (paymentData.status !== 'approved') {
      showToast('Payment must be approved before distributing profit', 'error');
      return;
    }
    
    // Check if profit was already distributed
    const distributionQuery = query(
      collection(db, 'profitDistributions'),
      where('paymentId', '==', paymentId)
    );
    const distributionSnap = await getDocs(distributionQuery);
    
    if (!distributionSnap.empty) {
      showToast('Profit already distributed for this payment', 'info');
      return;
    }
    
    await distributeProfit(paymentId, paymentData);
    
  } catch (error) {
    console.error('Error in manual profit distribution:', error);
    showToast('Error distributing profit', 'error');
  }
}

// View profit distribution history
async function viewProfitDistributions() {
  try {
    console.log('Starting to load profit distributions...');
    
    // Check if user is authenticated
    const currentUser = auth.currentUser;
    if (!currentUser) {
      showToast('Please log in to view profit history', 'error');
      return;
    }
    
    console.log('User authenticated, fetching data...');
    
    const distributionsQuery = query(
      collection(db, 'profitDistributions'),
      orderBy('distributedAt', 'desc'),
      limit(50)
    );
    const distributionsSnap = await getDocs(distributionsQuery);
    console.log('Distributions fetched:', distributionsSnap.size);
    
    const deductionsQuery = query(
      collection(db, 'profitDeductions'),
      orderBy('deductedAt', 'desc'),
      limit(50)
    );
    const deductionsSnap = await getDocs(deductionsQuery);
    console.log('Deductions fetched:', deductionsSnap.size);
    
    // Get wallet transactions for profit
    const walletQuery = query(
      collection(db, 'walletTransactions'),
      where('type', 'in', ['profit_distribution', 'profit_deduction']),
      orderBy('createdAt', 'desc'),
      limit(100)
    );
    const walletSnap = await getDocs(walletQuery);
    console.log('Wallet transactions fetched:', walletSnap.size);
    
    if (distributionsSnap.empty && deductionsSnap.empty && walletSnap.empty) {
      showToast('No profit distributions or deductions found', 'info');
      return;
    }
    
    let historyHTML = '<div class="profit-history-modal">';
    historyHTML += '<h3><i class="fas fa-chart-line"></i> Profit Distribution & Deduction History</h3>';
    
    // Show wallet transactions
    if (!walletSnap.empty) {
      historyHTML += '<h4><i class="fas fa-wallet"></i> Wallet Transactions</h4>';
      walletSnap.forEach(doc => {
        const data = doc.data();
        const createdAt = data.createdAt?.toDate?.()?.toLocaleString() || 'N/A';
        const isDeduction = data.type === 'profit_deduction';
        const amount = data.amount || 0;
        const balance = data.balance || 0;
        
        historyHTML += `
          <div class="wallet-transaction ${isDeduction ? 'deduction' : 'distribution'}">
            <div class="transaction-header">
              <span class="transaction-type">${isDeduction ? '📉 Profit Deduction' : '📈 Profit Distribution'}</span>
              <span class="transaction-amount ${isDeduction ? 'negative' : 'positive'}">
                ${isDeduction ? '-' : '+'}Rs ${Math.abs(amount).toFixed(2)}
              </span>
            </div>
            <div class="transaction-details">
              <p><strong>User ID:</strong> ${data.userId}</p>
              <p><strong>Payment ID:</strong> ${data.paymentId || 'N/A'}</p>
              <p><strong>Description:</strong> ${data.description || 'N/A'}</p>
              <p><strong>Profit %:</strong> ${data.profitPercentage || 'N/A'}%</p>
              <p><strong>New Balance:</strong> Rs ${balance.toFixed(2)}</p>
              <p><strong>Date:</strong> ${createdAt}</p>
            </div>
          </div>
        `;
      });
    }
    
    // Show distributions
    if (!distributionsSnap.empty) {
      historyHTML += '<h4><i class="fas fa-share-alt"></i> Profit Distributions</h4>';
      distributionsSnap.forEach(doc => {
        const data = doc.data();
        const distributedAt = data.distributedAt?.toDate?.()?.toLocaleString() || 'N/A';
        
        historyHTML += `
          <div class="distribution-item">
            <h5><i class="fas fa-receipt"></i> Payment ID: ${data.paymentId}</h5>
            <div class="transaction-details">
              <p><strong>Order Total:</strong> Rs ${data.orderTotal || 'N/A'}</p>
              <p><strong>Total Profit:</strong> Rs ${data.totalProfit?.toFixed(2) || 'N/A'}</p>
              <p><strong>Voucher Amount:</strong> Rs ${data.voucherAmount?.toFixed(2) || '0.00'}</p>
              <p><strong>Final Profit:</strong> Rs ${data.finalProfit?.toFixed(2) || 'N/A'}</p>
              <p><strong>Distributed At:</strong> ${distributedAt}</p>
            </div>
            
            <div class="distributions-list">
              <h6><i class="fas fa-users"></i> User Distributions</h6>
              ${data.distributions?.map(dist => `
                <div class="user-distribution">
                  <span><i class="fas fa-user"></i> ${dist.userName}</span>
                  <span>${dist.profitPercentage}%</span>
                  <span>Rs ${dist.profitAmount?.toFixed(2)}</span>
                  <span>Balance: Rs ${dist.newBalance?.toFixed(2)}</span>
                </div>
              `).join('') || '<p class="empty-state"><i class="fas fa-info-circle"></i> No distributions found</p>'}
            </div>
          </div>
        `;
      });
    }
    
    // Show deductions
    if (!deductionsSnap.empty) {
      historyHTML += '<h4><i class="fas fa-minus-circle"></i> Profit Deductions</h4>';
      deductionsSnap.forEach(doc => {
        const data = doc.data();
        const deductedAt = data.deductedAt?.toDate?.()?.toLocaleString() || 'N/A';
        
        historyHTML += `
          <div class="deduction-item">
            <h5><i class="fas fa-receipt"></i> Payment ID: ${data.paymentId}</h5>
            <div class="transaction-details">
              <p><strong>Order Total:</strong> Rs ${data.orderTotal || 'N/A'}</p>
              <p><strong>Total Deducted:</strong> Rs ${data.totalProfitDeducted?.toFixed(2) || 'N/A'}</p>
              <p><strong>Reason:</strong> ${data.reason || 'N/A'}</p>
              <p><strong>Deducted At:</strong> ${deductedAt}</p>
            </div>
            
            <div class="deductions-list">
              <h6><i class="fas fa-users"></i> User Deductions</h6>
              ${data.deductions?.map(deduct => `
                <div class="user-deduction">
                  <span><i class="fas fa-user"></i> ${deduct.userName}</span>
                  <span>${deduct.profitPercentage}%</span>
                  <span>Rs ${deduct.profitAmount?.toFixed(2)}</span>
                  <span>Balance: Rs ${deduct.previousBalance?.toFixed(2)} → Rs ${deduct.newBalance?.toFixed(2)}</span>
                </div>
              `).join('') || '<p class="empty-state"><i class="fas fa-info-circle"></i> No deductions found</p>'}
            </div>
          </div>
        `;
      });
    }
    
    // Add empty state if no data
    if (distributionsSnap.empty && deductionsSnap.empty && walletSnap.empty) {
      historyHTML += `
        <div class="empty-state">
          <i class="fas fa-chart-line"></i>
          <h4>No Profit History Found</h4>
          <p>No profit distributions or deductions have been recorded yet.</p>
        </div>
      `;
    }
    
    historyHTML += '</div>';
    
    // Show in modal
    const modal = document.getElementById('orderDetailsModal');
    const modalContent = document.getElementById('orderDetailsContent');
    
    console.log('Modal elements:', { modal, modalContent });
    
    if (modal && modalContent) {
      modalContent.innerHTML = `
        <div class="modal-header">
          <h3>Profit History</h3>
          <button class="close-modal" onclick="closeOrderDetailsModal()">&times;</button>
        </div>
        <div class="modal-body">
          ${historyHTML}
        </div>
      `;
      
      modal.style.display = 'block';
      console.log('Modal displayed successfully');
    } else {
      console.error('Modal elements not found:', { modal, modalContent });
      showToast('Error: Modal not found', 'error');
    }
    
  } catch (error) {
    console.error('Error loading profit history:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    showToast(`Error loading profit history: ${error.message}`, 'error');
  }
}

// Make functions globally available
// Add User Modal Functions
function openAddUserModal() {
    const modal = document.getElementById('addUserModal');
    if (modal) {
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
        
        // Reset form
        const form = document.getElementById('addUserForm');
        if (form) {
            form.reset();
        }
    }
}

function closeAddUserModal() {
    const modal = document.getElementById('addUserModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

// Create new user
async function createUser(event) {
    event.preventDefault();
    
    const form = event.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    
    // Get form data
    const fullName = document.getElementById('newUserName').value.trim();
    const email = document.getElementById('newUserEmail').value.trim();
    const password = document.getElementById('newUserPassword').value;
    const role = document.getElementById('newUserRole').value;
    const status = document.getElementById('newUserStatus').value;
    
    // Validation
    if (!fullName || !email || !password || !role || !status) {
        showToast('Please fill in all required fields', 'error');
        return;
    }
    
    if (password.length < 6) {
        showToast('Password must be at least 6 characters long', 'error');
        return;
    }
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showToast('Please enter a valid email address', 'error');
        return;
    }
    
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
    submitBtn.disabled = true;
    
    try {
        // Check if user already exists
        const usersQuery = query(
            collection(db, 'users'),
            where('email', '==', email)
        );
        const existingUsers = await getDocs(usersQuery);
        
        if (!existingUsers.empty) {
            showToast('A user with this email already exists', 'error');
            return;
        }
        
        // Create user in Firebase Auth
        const { createUserWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js');
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const newUser = userCredential.user;
        
        // Create user document in Firestore
        const userData = {
            firstName: fullName.split(' ')[0] || '',
            lastName: fullName.split(' ').slice(1).join(' ') || '',
            email: email,
            phone: '',
            role: role,
            status: status,
            balance: 0,
            profitPercentage: role === 'admin' || role === 'super-admin' ? 0 : 5, // Default profit percentage
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            createdBy: auth.currentUser.uid
        };
        
        await addDoc(collection(db, 'users'), {
            ...userData,
            uid: newUser.uid
        });
        
        // Add wallet transaction for initial balance
        if (userData.balance > 0) {
            await addDoc(collection(db, 'walletTransactions'), {
                userId: newUser.uid,
                type: 'admin_credit',
                amount: userData.balance,
                balance: userData.balance,
                description: 'Initial balance from admin creation',
                createdAt: serverTimestamp()
            });
        }
        
        showToast(`User "${fullName}" created successfully!`, 'success');
        
        // Close modal and refresh users list
        closeAddUserModal();
        await loadUsers();
        
    } catch (error) {
        console.error('Error creating user:', error);
        
        let errorMessage = 'Failed to create user';
        if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'Email is already in use';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'Password is too weak';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Invalid email address';
        } else if (error.message) {
            errorMessage = error.message;
        }
        
        showToast(errorMessage, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
}

window.showOrderDetails = showOrderDetails;
window.closeOrderDetailsModal = closeOrderDetailsModal;
window.viewBase64Image = viewBase64Image;
window.showToast = showToast;
window.updatePaymentStatus = updatePaymentStatus;
window.updateOrderStatus = updateOrderStatus;
window.openAddCouponModal = openAddCouponModal;
window.closeAddCouponModal = closeAddCouponModal;
window.manualProfitDistribution = manualProfitDistribution;
window.viewProfitDistributions = viewProfitDistributions;
window.openAddUserModal = openAddUserModal;
window.closeAddUserModal = closeAddUserModal;
window.createUser = createUser;

// Payment Management Functions
function statusBadge(status) {
  const cls = status === 'approved' ? 'status-approved'
            : status === 'rejected' ? 'status-rejected'
            : 'status-pending';
  const text = status ? status : 'pending';
  return `<span class="status-badge ${cls}">${text}</span>`;
}

function orderStatusBadge(status) {
  const cls = status === 'delivered' ? 'status-delivered'
            : status === 'cancelled' ? 'status-cancelled'
            : 'status-pending';
  const text = status ? status : 'pending';
  return `<span class="status-badge ${cls}">${text}</span>`;
}

function rowTemplate(id, data) {
  const paymentStatus = data.status || 'pending';
  const orderStatus = data.orderStatus || 'pending';
  
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
      <td>
        <select class="payment-status-select" onchange="updatePaymentStatus('${id}', this.value)" style="padding: 4px 8px; border-radius: 4px; border: 1px solid #ddd;">
          <option value="pending" ${paymentStatus === 'pending' ? 'selected' : ''}>Pending</option>
          <option value="approved" ${paymentStatus === 'approved' ? 'selected' : ''}>Approved</option>
          <option value="rejected" ${paymentStatus === 'rejected' ? 'selected' : ''}>Rejected</option>
        </select>
      </td>
      <td>
        <select class="order-status-select" onchange="updateOrderStatus('${id}', this.value)" style="padding: 4px 8px; border-radius: 4px; border: 1px solid #ddd;">
          <option value="pending" ${orderStatus === 'pending' ? 'selected' : ''}>Pending</option>
          <option value="delivered" ${orderStatus === 'delivered' ? 'selected' : ''}>Delivered</option>
          <option value="cancelled" ${orderStatus === 'cancelled' ? 'selected' : ''}>Cancelled</option>
        </select>
      </td>
      <td class="actions">
        <button class="btn-order-details" onclick="showOrderDetails('${id}')">Order Details</button>
        <button class="btn-profit-dist" onclick="manualProfitDistribution('${id}')" title="Distribute Profit">💰</button>
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
    tbody.innerHTML = '<tr><td colspan="6">Loading...</td></tr>';
  
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
      tbody.innerHTML = '<tr><td colspan="6">No payments yet.</td></tr>';
    }
  } catch (err) {
    console.error('Error in loadPayments:', err);
    tbody.innerHTML = '<tr><td colspan="6">Failed to load.</td></tr>';
  }
}

function wirePaymentActions() {
  const table = document.getElementById('paymentsTable');
  if (!table) return;
  
  // Note: Payment and order status updates are now handled directly by the select dropdowns
  // using the updatePaymentStatus and updateOrderStatus functions
  // This function is kept for any future table-level event handling needs
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
    
    // Get coupon usage data
    const couponUsageData = await getCouponUsageData();
    
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
      
      // Get coupon usage for this product
      const productCouponUsage = couponUsageData.filter(usage => 
        usage.productIds && usage.productIds.includes(product.id)
      );
      
      const couponUsageCount = productCouponUsage.length;
      const uniqueCouponsUsed = [...new Set(productCouponUsage.map(usage => usage.couponCode))].length;
      
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
            <div class="coupon-usage-info">
              <p class="coupon-usage">
                <i class="fas fa-tag"></i> 
                Coupon Usage: ${couponUsageCount} time${couponUsageCount !== 1 ? 's' : ''}
                ${uniqueCouponsUsed > 0 ? ` (${uniqueCouponsUsed} unique coupon${uniqueCouponsUsed !== 1 ? 's' : ''})` : ''}
              </p>
              ${couponUsageCount > 0 ? `
                <div class="coupon-details">
                  <small>Recent coupons used:</small>
                  <div class="coupon-list">
                    ${productCouponUsage.slice(0, 3).map(usage => 
                      `<span class="coupon-tag">${usage.couponCode}</span>`
                    ).join('')}
                    ${productCouponUsage.length > 3 ? `<span class="coupon-more">+${productCouponUsage.length - 3} more</span>` : ''}
                  </div>
                </div>
              ` : ''}
            </div>
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

// Function to get coupon usage data
async function getCouponUsageData() {
  try {
    const couponUsageCol = collection(db, 'couponUsage');
    const q = query(couponUsageCol, orderBy('usedAt', 'desc'));
    const snap = await getDocs(q);
    
    return snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error fetching coupon usage data:', error);
    return [];
  }
}

// Function to get detailed coupon usage for a specific coupon
async function getCouponUsageDetails(couponCode) {
  try {
    const couponUsageCol = collection(db, 'couponUsage');
    const q = query(couponUsageCol, where('couponCode', '==', couponCode), orderBy('usedAt', 'desc'));
    const snap = await getDocs(q);
    
    return snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error fetching coupon usage details:', error);
    return [];
  }
}

// Function to show coupon usage details in a modal
async function showCouponUsageDetails(couponCode) {
  try {
    const usageDetails = await getCouponUsageDetails(couponCode);
    
    if (usageDetails.length === 0) {
      showToast('No usage details found for this coupon', 'info');
      return;
    }
    
    // Get product details for each usage
    const usageDetailsWithProducts = await Promise.all(
      usageDetails.map(async (usage) => {
        const productDetails = [];
        if (usage.productIds && usage.productIds.length > 0) {
          for (const productId of usage.productIds) {
            try {
              const productDoc = await getDoc(doc(db, 'products', productId));
              if (productDoc.exists()) {
                const productData = productDoc.data();
                productDetails.push({
                  id: productId,
                  name: productData.name,
                  imageUrl: productData.imageUrl || productData.imagePath
                });
              }
            } catch (error) {
              console.error('Error fetching product details:', error);
            }
          }
        }
        return { ...usage, productDetails };
      })
    );
    
    // Create modal HTML
    const modalHTML = `
      <div id="couponUsageModal" style="display: block; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.5);">
        <div style="background-color: white; margin: 2% auto; padding: 20px; border-radius: 10px; width: 90%; max-width: 1200px; max-height: 90%; overflow-y: auto;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <h2>Coupon Usage Details: ${couponCode}</h2>
            <button onclick="closeCouponUsageModal()" style="background: none; border: none; font-size: 24px; cursor: pointer;">&times;</button>
          </div>
          <div style="margin-bottom: 20px; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
              <p style="margin: 0; font-weight: bold; color: #667eea;">Total Usage</p>
              <p style="margin: 5px 0 0 0; font-size: 24px; font-weight: bold;">${usageDetails.length}</p>
            </div>
            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
              <p style="margin: 0; font-weight: bold; color: #667eea;">Total Discount</p>
              <p style="margin: 5px 0 0 0; font-size: 24px; font-weight: bold;">Rs ${usageDetails.reduce((sum, usage) => sum + (usage.discountAmount || 0), 0).toFixed(2)}</p>
            </div>
            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
              <p style="margin: 0; font-weight: bold; color: #667eea;">Unique Products</p>
              <p style="margin: 5px 0 0 0; font-size: 24px; font-weight: bold;">${[...new Set(usageDetails.flatMap(u => u.productIds || []))].length}</p>
            </div>
            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
              <p style="margin: 0; font-weight: bold; color: #667eea;">Total Items</p>
              <p style="margin: 5px 0 0 0; font-size: 24px; font-weight: bold;">${usageDetails.reduce((sum, usage) => sum + (usage.cartItems ? usage.cartItems.reduce((itemSum, item) => itemSum + item.quantity, 0) : 0), 0)}</p>
            </div>
          </div>
          
          ${(() => {
            // Calculate popular products and variants
            const productStats = {};
            const variantStats = {};
            
            usageDetailsWithProducts.forEach(usage => {
              if (usage.cartItems) {
                usage.cartItems.forEach(item => {
                  // Product stats
                  const productKey = `${item.productName} (${item.productId})`;
                  if (!productStats[productKey]) {
                    productStats[productKey] = { name: item.productName, id: item.productId, count: 0, totalQuantity: 0 };
                  }
                  productStats[productKey].count++;
                  productStats[productKey].totalQuantity += item.quantity;
                  
                  // Variant stats
                  const variantKey = `${item.productName} - ${item.variantLabel}`;
                  if (!variantStats[variantKey]) {
                    variantStats[variantKey] = { productName: item.productName, variantLabel: item.variantLabel, count: 0, totalQuantity: 0 };
                  }
                  variantStats[variantKey].count++;
                  variantStats[variantKey].totalQuantity += item.quantity;
                });
              }
            });
            
            const topProducts = Object.values(productStats).sort((a, b) => b.count - a.count).slice(0, 5);
            const topVariants = Object.values(variantStats).sort((a, b) => b.count - a.count).slice(0, 5);
            
            return `
              ${topProducts.length > 0 ? `
                <div style="margin-top: 20px;">
                  <h3 style="margin-bottom: 15px; color: #4a5568;">Most Popular Products</h3>
                  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px;">
                    ${topProducts.map(product => `
                      <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px;">
                        <p style="margin: 0 0 5px 0; font-weight: 600; color: #2d3748;">${product.name}</p>
                        <p style="margin: 0; color: #667eea; font-size: 14px;">${product.count} purchase${product.count !== 1 ? 's' : ''}</p>
                        <p style="margin: 5px 0 0 0; color: #718096; font-size: 12px;">${product.totalQuantity} total items</p>
                      </div>
                    `).join('')}
                  </div>
                </div>
              ` : ''}
              
              ${topVariants.length > 0 ? `
                <div style="margin-top: 20px;">
                  <h3 style="margin-bottom: 15px; color: #4a5568;">Most Popular Variants</h3>
                  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 10px;">
                    ${topVariants.map(variant => `
                      <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px;">
                        <p style="margin: 0 0 5px 0; font-weight: 600; color: #2d3748;">${variant.productName}</p>
                        <p style="margin: 0; color: #667eea; font-size: 14px; font-weight: 500;">
                          <i class="fas fa-tag"></i> ${variant.variantLabel}
                        </p>
                        <p style="margin: 5px 0 0 0; color: #718096; font-size: 12px;">${variant.count} purchase${variant.count !== 1 ? 's' : ''} • ${variant.totalQuantity} items</p>
                      </div>
                    `).join('')}
                  </div>
                </div>
              ` : ''}
            `;
          })()}
          
          <div style="margin-top: 20px;">
            <h3 style="margin-bottom: 15px; color: #4a5568;">Usage History</h3>
            <div style="display: grid; gap: 15px;">
              ${usageDetailsWithProducts.map((usage, index) => `
                <div style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; background: #fafafa;">
                  <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 15px;">
                    <div>
                      <h4 style="margin: 0 0 5px 0; color: #2d3748;">Order #${usage.orderId || 'N/A'}</h4>
                      <p style="margin: 0; color: #718096; font-size: 14px;">
                        ${usage.usedAt ? usage.usedAt.toDate().toLocaleString() : 'N/A'}
                      </p>
                    </div>
                    <div style="text-align: right;">
                      <p style="margin: 0; font-size: 18px; font-weight: bold; color: #48bb78;">
                        Rs ${(usage.discountAmount || 0).toFixed(2)} discount
                      </p>
                      <p style="margin: 5px 0 0 0; color: #718096; font-size: 12px;">
                        User: ${usage.userId || 'Anonymous'}
                      </p>
                    </div>
                  </div>
                  
                  ${usage.cartItems && usage.cartItems.length > 0 ? `
                    <div>
                      <h5 style="margin: 0 0 10px 0; color: #4a5568;">Products & Variants Purchased:</h5>
                      <div style="display: grid; gap: 10px;">
                        ${usage.cartItems.map(item => `
                          <div style="display: flex; align-items: center; justify-content: space-between; padding: 15px; background: white; border-radius: 8px; border: 1px solid #e2e8f0;">
                            <div style="display: flex; align-items: center; flex: 1;">
                              <div style="width: 50px; height: 50px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; margin-right: 15px; display: flex; align-items: center; justify-content: center;">
                                <i class="fas fa-box" style="color: white; font-size: 20px;"></i>
                              </div>
                              <div style="flex: 1;">
                                <p style="margin: 0; font-weight: 600; color: #2d3748; font-size: 16px;">${item.productName}</p>
                                <p style="margin: 5px 0 0 0; color: #667eea; font-size: 14px; font-weight: 500;">
                                  <i class="fas fa-tag"></i> ${item.variantLabel}
                                </p>
                                <p style="margin: 5px 0 0 0; color: #718096; font-size: 12px;">
                                  Product ID: ${item.productId}
                                </p>
                              </div>
                            </div>
                            <div style="text-align: right;">
                              <p style="margin: 0; font-size: 14px; color: #718096;">Quantity: ${item.quantity}</p>
                              <p style="margin: 5px 0 0 0; font-size: 16px; font-weight: bold; color: #48bb78;">
                                Rs ${item.totalPrice.toFixed(2)}
                              </p>
                              <p style="margin: 2px 0 0 0; font-size: 12px; color: #a0aec0;">
                                Rs ${item.variantPrice} each
                              </p>
                            </div>
                          </div>
                        `).join('')}
                      </div>
                    </div>
                  ` : usage.productDetails && usage.productDetails.length > 0 ? `
                    <div>
                      <h5 style="margin: 0 0 10px 0; color: #4a5568;">Products Purchased (Legacy Data):</h5>
                      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 10px;">
                        ${usage.productDetails.map(product => `
                          <div style="display: flex; align-items: center; padding: 10px; background: white; border-radius: 8px; border: 1px solid #e2e8f0;">
                            ${product.imageUrl ? `
                              <img src="${product.imageUrl}" alt="${product.name}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 6px; margin-right: 10px;">
                            ` : `
                              <div style="width: 40px; height: 40px; background: #e2e8f0; border-radius: 6px; margin-right: 10px; display: flex; align-items: center; justify-content: center;">
                                <i class="fas fa-image" style="color: #a0aec0;"></i>
                              </div>
                            `}
                            <div>
                              <p style="margin: 0; font-weight: 600; color: #2d3748; font-size: 14px;">${product.name}</p>
                              <p style="margin: 2px 0 0 0; color: #718096; font-size: 12px;">ID: ${product.id}</p>
                            </div>
                          </div>
                        `).join('')}
                      </div>
                    </div>
                  ` : `
                    <div style="padding: 10px; background: #fed7d7; border-radius: 6px; border-left: 4px solid #f56565;">
                      <p style="margin: 0; color: #c53030; font-size: 14px;">
                        <i class="fas fa-exclamation-triangle"></i> Product details not available
                      </p>
                    </div>
                  `}
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
    
    // Add modal to page
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    document.body.style.overflow = 'hidden';
    
  } catch (error) {
    console.error('Error showing coupon usage details:', error);
    showToast('Error loading coupon usage details', 'error');
  }
}

// Function to close coupon usage modal
function closeCouponUsageModal() {
  const modal = document.getElementById('couponUsageModal');
  if (modal) {
    modal.remove();
    document.body.style.overflow = 'auto';
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
          <label>Cost Price (CP) - Rs</label>
          <input type="number" class="variant-cp" step="0.01" placeholder="5.00" required>
        </div>
        <div class="form-group">
          <label>Selling Price (SP) - Rs</label>
          <input type="number" class="variant-sp" step="0.01" placeholder="7.99" required>
        </div>
        <div class="form-group">
          <label>Profit Margin</label>
          <input type="text" class="variant-margin" readonly placeholder="Auto-calculated">
        </div>
      </div>
      <button type="button" class="remove-variant" onclick="removeVariant(this)">×</button>
    </div>
  `;
  
  container.insertAdjacentHTML('beforeend', variantHTML);
  
  // Add event listeners for auto-calculation
  const newVariant = container.lastElementChild;
  const cpInput = newVariant.querySelector('.variant-cp');
  const spInput = newVariant.querySelector('.variant-sp');
  const marginInput = newVariant.querySelector('.variant-margin');
  
  function calculateMargin() {
    const cp = parseFloat(cpInput.value) || 0;
    const sp = parseFloat(spInput.value) || 0;
    if (cp > 0 && sp > 0) {
      const margin = (sp - cp).toFixed(2);
      marginInput.value = `Rs ${margin}`;
    } else {
      marginInput.value = '';
    }
  }
  
  cpInput.addEventListener('input', calculateMargin);
  spInput.addEventListener('input', calculateMargin);
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
        <div class="form-group">
          <label>Label (e.g. 1000 V-Bucks)</label>
          <input type="text" class="variant-label" placeholder="1000 V-Bucks" required>
        </div>
        <div class="form-group">
          <label>Cost Price (CP) - Rs</label>
          <input type="number" class="variant-cp" step="0.01" placeholder="5.00" required>
        </div>
        <div class="form-group">
          <label>Selling Price (SP) - Rs</label>
          <input type="number" class="variant-sp" step="0.01" placeholder="7.99" required>
        </div>
        <div class="form-group">
          <label>Profit Margin</label>
          <input type="text" class="variant-margin" readonly placeholder="Auto-calculated">
        </div>
        <button type="button" class="remove-variant" onclick="removeVariant(this)">×</button>
      </div>
    </div>
  `;
  
  container.insertAdjacentHTML('beforeend', variantHTML);
  
  // Add event listeners for auto-calculation
  const newVariant = container.lastElementChild;
  const cpInput = newVariant.querySelector('.variant-cp');
  const spInput = newVariant.querySelector('.variant-sp');
  const marginInput = newVariant.querySelector('.variant-margin');
  
  function calculateMargin() {
    const cp = parseFloat(cpInput.value) || 0;
    const sp = parseFloat(spInput.value) || 0;
    if (cp > 0 && sp > 0) {
      const margin = (sp - cp).toFixed(2);
      marginInput.value = `Rs ${margin}`;
    } else {
      marginInput.value = '';
    }
  }
  
  cpInput.addEventListener('input', calculateMargin);
  spInput.addEventListener('input', calculateMargin);
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
            <label>Cost Price (CP) - Rs</label>
            <input type="number" class="variant-cp" step="0.01" placeholder="5.00" required>
          </div>
          <div class="form-group">
            <label>Selling Price (SP) - Rs</label>
            <input type="number" class="variant-sp" step="0.01" placeholder="7.99" required>
          </div>
          <div class="form-group">
            <label>Profit Margin</label>
            <input type="text" class="variant-margin" readonly placeholder="Auto-calculated">
          </div>
        </div>
        <button type="button" class="remove-variant" onclick="removeVariant(this)">×</button>
      </div>
    `;
    
    // Add event listeners for auto-calculation
    const newVariant = variantsContainer.firstElementChild;
    const cpInput = newVariant.querySelector('.variant-cp');
    const spInput = newVariant.querySelector('.variant-sp');
    const marginInput = newVariant.querySelector('.variant-margin');
    
    function calculateMargin() {
      const cp = parseFloat(cpInput.value) || 0;
      const sp = parseFloat(spInput.value) || 0;
      if (cp > 0 && sp > 0) {
        const margin = ((sp - cp) / cp * 100).toFixed(2);
        marginInput.value = `${margin}%`;
      } else {
        marginInput.value = '';
      }
    }
    
    cpInput.addEventListener('input', calculateMargin);
    spInput.addEventListener('input', calculateMargin);
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
    document.getElementById('editProductDiscount').value = product.discount || 0;
    document.getElementById('editProductGame').value = product.game || '';
    

    
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
            <div class="form-group">
              <label>Label (e.g. 1000 V-Bucks)</label>
              <input type="text" class="variant-label" placeholder="1000 V-Bucks" value="${variant.label || ''}" required>
            </div>
            <div class="form-group">
              <label>Cost Price (CP) - Rs</label>
              <input type="number" class="variant-cp" step="0.01" placeholder="5.00" value="${variant.cp || ''}" required>
            </div>
            <div class="form-group">
              <label>Selling Price (SP) - Rs</label>
              <input type="number" class="variant-sp" step="0.01" placeholder="7.99" value="${variant.sp || variant.price || ''}" required>
            </div>
            <div class="form-group">
              <label>Profit Margin</label>
              <input type="text" class="variant-margin" readonly placeholder="Auto-calculated">
            </div>
          <button type="button" class="remove-variant" onclick="removeVariant(this)">×</button>
          </div>
        `;
        variantsContainer.appendChild(variantDiv);
        
        // Add event listeners for auto-calculation
        const cpInput = variantDiv.querySelector('.variant-cp');
        const spInput = variantDiv.querySelector('.variant-sp');
        const marginInput = variantDiv.querySelector('.variant-margin');
        
        function calculateMargin() {
          const cp = parseFloat(cpInput.value) || 0;
          const sp = parseFloat(spInput.value) || 0;
          if (cp > 0 && sp > 0) {
            const margin = ((sp - cp) / cp * 100).toFixed(2);
            marginInput.value = `${margin}%`;
          } else {
            marginInput.value = '';
          }
        }
        
        cpInput.addEventListener('input', calculateMargin);
        spInput.addEventListener('input', calculateMargin);
        
        // Calculate initial margin
        calculateMargin();
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
    const productDiscount = document.getElementById('productDiscount').value;
    const productGame = (document.getElementById('productGame')?.value || '').trim();
    
    
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
      const cp = parseFloat(variantEl.querySelector('.variant-cp').value);
      const sp = parseFloat(variantEl.querySelector('.variant-sp').value);
      
      if (label && cp && sp) {
        variants.push({
          label,
          cp,
          sp,
          price: sp // Keep price field for backward compatibility
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
      discount: productDiscount ? parseFloat(productDiscount) : 0,
      game: productGame || '',
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
    const productDiscount = document.getElementById('editProductDiscount').value;
    const productGame = document.getElementById('editProductGame').value;
   
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
      const cp = parseFloat(variantEl.querySelector('.variant-cp').value);
      const sp = parseFloat(variantEl.querySelector('.variant-sp').value);
      
      if (label && cp && sp) {
        variants.push({
          label,
          cp,
          sp,
          price: sp // Keep price field for backward compatibility
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
      discount: productDiscount ? parseFloat(productDiscount) : 0,
      game: productGame.trim() || '',
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

// Debug function to check user count and permissions
async function debugUserAccess() {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.log('No authenticated user');
      return;
    }
    
    console.log('Current user:', currentUser.uid, currentUser.email);
    
    // Check if user is admin
    const isAdminUser = await isAdmin(currentUser.uid);
    console.log('Is admin:', isAdminUser);
    
    // Try to get user count
    const allUsers = await getDocs(usersCol);
    console.log('Total users in database:', allUsers.size);
    
    // List first few users
    allUsers.forEach((doc, index) => {
      if (index < 5) {
        console.log(`User ${index + 1}:`, doc.id, doc.data());
      }
    });
    
  } catch (error) {
    console.error('Debug user access error:', error);
  }
}

async function loadUsers() {
  const tbody = document.querySelector('#usersTable tbody');
  if (!tbody) return;
  
  tbody.innerHTML = '<tr><td colspan="6">Loading...</td></tr>';
  try {
    // Try to get users with orderBy first, if it fails, get all users without ordering
    let snap;
  try {
    const q = query(usersCol, orderBy('createdAt', 'desc'));
      snap = await getDocs(q);
      console.log('Users loaded with orderBy:', snap.size);
    } catch (orderError) {
      // If orderBy fails (likely due to missing index), get all users without ordering
      console.log('OrderBy failed, trying without ordering:', orderError.message);
      snap = await getDocs(usersCol);
      console.log('Users loaded without orderBy:', snap.size);
    }
    
    const rows = [];
    
    snap.forEach(docSnap => {
      const userData = docSnap.data();
      console.log('Processing user:', docSnap.id, userData.email);
      const created = userData.createdAt?.toDate?.() || new Date(0);
      const dateStr = created.toLocaleDateString();
      const name = `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || 'N/A';
      const email = userData.email || 'N/A';
      const role = userData.role || 'user';
      const status = userData.status || 'active';
      
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
          <td><span class="status-badge ${status === 'active' ? 'status-active' : 'status-inactive'}">${status}</span></td>
          <td>${dateStr}</td>
          <td>
            <button class="btn" onclick="viewUserDetails('${docSnap.id}')">View</button>
          </td>
        </tr>
      `);
    });
    
    // Sort rows by creation date if we couldn't use orderBy
    if (rows.length > 0) {
      rows.sort((a, b) => {
        const dateA = new Date(a.match(/<td>(\d+\/\d+\/\d+)<\/td>/)?.[1] || '1970/1/1');
        const dateB = new Date(b.match(/<td>(\d+\/\d+\/\d+)<\/td>/)?.[1] || '1970/1/1');
        return dateB - dateA; // Descending order
      });
    }
    
    console.log('Total rows processed:', rows.length);
    tbody.dataset.allRows = JSON.stringify(rows);
    tbody.innerHTML = rows.length ? rows.join('') : '<tr><td colspan="6">No users found.</td></tr>';
  } catch (err) {
    console.error('Error loading users:', err);
    tbody.innerHTML = '<tr><td colspan="6">Failed to load users. Check console for details.</td></tr>';
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
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) { 
      showToast('User not found', 'error'); 
      return; 
    }
    
    const userData = userDoc.data();
    const createdAt = userData.createdAt?.toDate?.()?.toLocaleString() || 'N/A';
    const updatedAt = userData.updatedAt?.toDate?.()?.toLocaleString() || 'N/A';
    
    // Show modal with user details and edit form
    const modal = document.getElementById('orderDetailsModal');
    const modalContent = document.getElementById('orderDetailsContent');
    
    if (modal && modalContent) {
      modalContent.innerHTML = `
        <div class="modal-header">
          <h3><i class="fas fa-user"></i> User Details</h3>
          <button class="close-modal" onclick="closeOrderDetailsModal()">&times;</button>
        </div>
        <div class="modal-body">
          <div class="user-details-container">
            <div class="user-info-section">
              <h4><i class="fas fa-info-circle"></i> User Information</h4>
              <div class="user-details-grid">
                <div class="detail-item">
                  <label>User ID:</label>
                  <span>${userId}</span>
                </div>
                <div class="detail-item">
                  <label>Email:</label>
                  <span>${userData.email || 'N/A'}</span>
                </div>
                <div class="detail-item">
                  <label>Phone:</label>
                  <span>${userData.phone || 'N/A'}</span>
                </div>
                <div class="detail-item">
                  <label>Created:</label>
                  <span>${createdAt}</span>
                </div>
                <div class="detail-item">
                  <label>Last Updated:</label>
                  <span>${updatedAt}</span>
                </div>
                <div class="detail-item">
                  <label>Status:</label>
                  <span class="status-badge ${userData.status === 'active' ? 'status-active' : 'status-inactive'}">${userData.status || 'active'}</span>
                </div>
              </div>
            </div>
            
            <div class="user-edit-section">
              <h4><i class="fas fa-edit"></i> Edit User Details</h4>
              <form id="editUserForm" onsubmit="saveUserDetails(event, '${userId}')">
                <div class="form-row">
                  <div class="form-group">
                    <label for="editFirstName">First Name</label>
                    <input type="text" id="editFirstName" value="${userData.firstName || ''}" required>
                  </div>
                  <div class="form-group">
                    <label for="editLastName">Last Name</label>
                    <input type="text" id="editLastName" value="${userData.lastName || ''}" required>
                  </div>
                </div>
                
                <div class="form-row">
                  <div class="form-group">
                    <label for="editEmail">Email</label>
                    <input type="email" id="editEmail" value="${userData.email || ''}" required>
                  </div>
                  <div class="form-group">
                    <label for="editPhone">Phone</label>
                    <input type="tel" id="editPhone" value="${userData.phone || ''}">
                  </div>
                </div>
                
                <div class="form-row">
                  <div class="form-group">
                    <label for="editRole">Role</label>
                    <select id="editRole" required>
                      <option value="user" ${userData.role === 'user' ? 'selected' : ''}>User</option>
                      <option value="admin" ${userData.role === 'admin' ? 'selected' : ''}>Admin</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label for="editStatus">Status</label>
                    <select id="editStatus" required>
                      <option value="active" ${userData.status === 'active' ? 'selected' : ''}>Active</option>
                      <option value="inactive" ${userData.status === 'inactive' ? 'selected' : ''}>Inactive</option>
                    </select>
                  </div>
                </div>
                
                <div class="form-group">
                  <label for="editBalance">Wallet Balance (Rs)</label>
                  <input type="number" id="editBalance" value="${userData.balance || 0}" step="0.01" min="0">
                </div>
                
                <div class="form-group">
                  <label for="editProfitPercentage">Profit Percentage (%)</label>
                  <input type="number" id="editProfitPercentage" value="${userData.profitPercentage || 0}" step="0.01" min="0" max="100">
                </div>
                
                <div class="form-actions">
                  <button type="submit" class="btn btn-primary">
                    <i class="fas fa-save"></i> Save Changes
                  </button>
                  <button type="button" class="btn btn-secondary" onclick="closeOrderDetailsModal()">
                    <i class="fas fa-times"></i> Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      `;
      
      modal.style.display = 'block';
    } else {
      console.error('Modal elements not found:', { modal, modalContent });
      showToast('Error: Modal not found', 'error');
    }
  } catch (error) {
    console.error('Error loading user details:', error);
    showToast('Failed to load user details', 'error');
  }
}

// Save user details from edit form
async function saveUserDetails(event, userId) {
  event.preventDefault();
  
  try {
    const formData = {
      firstName: document.getElementById('editFirstName').value.trim(),
      lastName: document.getElementById('editLastName').value.trim(),
      email: document.getElementById('editEmail').value.trim(),
      phone: document.getElementById('editPhone').value.trim(),
      role: document.getElementById('editRole').value,
      status: document.getElementById('editStatus').value,
      balance: parseFloat(document.getElementById('editBalance').value) || 0,
      profitPercentage: parseFloat(document.getElementById('editProfitPercentage').value) || 0,
      updatedAt: serverTimestamp()
    };
    
    // Validate required fields
    if (!formData.firstName || !formData.lastName || !formData.email) {
      showToast('Please fill in all required fields', 'error');
      return;
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      showToast('Please enter a valid email address', 'error');
      return;
    }
    
    // Validate profit percentage
    if (formData.profitPercentage < 0 || formData.profitPercentage > 100) {
      showToast('Profit percentage must be between 0 and 100', 'error');
      return;
    }
    
    // Validate balance
    if (formData.balance < 0) {
      showToast('Balance cannot be negative', 'error');
      return;
    }
    
    // Disable submit button
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    
    // Update user document
    await updateDoc(doc(db, 'users', userId), formData);
    
    // Add wallet transaction if balance changed
    const currentUserDoc = await getDoc(doc(db, 'users', userId));
    const currentBalance = currentUserDoc.data()?.balance || 0;
    
    if (formData.balance !== currentBalance) {
      const balanceChange = formData.balance - currentBalance;
      
      await addDoc(collection(db, 'walletTransactions'), {
        userId: userId,
        type: balanceChange > 0 ? 'admin_credit' : 'admin_debit',
        amount: Math.abs(balanceChange),
        balance: formData.balance,
        description: `Balance ${balanceChange > 0 ? 'added' : 'deducted'} by admin`,
        createdAt: serverTimestamp(),
        adminAction: true
      });
    }
    
    showToast('User details updated successfully', 'success');
    
    // Close modal and refresh users table
    closeOrderDetailsModal();
    loadUsers();
    
  } catch (error) {
    console.error('Error saving user details:', error);
    showToast('Error saving user details: ' + error.message, 'error');
  } finally {
    // Re-enable submit button
    const submitBtn = event.target.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
    }
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

// Promoter Management Functions
async function loadPromoters() {
  const tbody = document.querySelector('#promotersTable tbody');
  if (!tbody) return;
  
  tbody.innerHTML = '<tr><td colspan="7"><div class="promoters-loading"></div></td></tr>';
  try {
    const q = query(promotersCol, orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    const rows = [];
    
    snap.forEach(docSnap => {
      const promoterData = docSnap.data();
      const created = promoterData.createdAt?.toDate?.() || new Date(0);
      const dateStr = created.toLocaleDateString();
      const name = promoterData.name || 'N/A';
      const platform = promoterData.platform || 'N/A';
      const subscribers = formatNumber(promoterData.subscribers || 0);
      const status = promoterData.isActive ? 'Active' : 'Inactive';
      const statusClass = promoterData.isActive ? 'status-active' : 'status-inactive';
      
      rows.push(`
        <tr data-promoter-id="${docSnap.id}">
          <td>
            <div class="promoter-profile">
              <img src="${promoterData.profilePicture || 'https://via.placeholder.com/40x40/667eea/ffffff?text=' + (name.charAt(0) || '?')}" 
                   alt="${name}" 
                   class="promoter-avatar"
                   onerror="this.src='https://via.placeholder.com/40x40/667eea/ffffff?text=' + '${name.charAt(0) || '?'}'">
              <div class="promoter-info">
                <h4>${name}</h4>
                <p>${promoterData.url || 'No URL'}</p>
      </div>
    </div>
          </td>
          <td>
            <span class="platform-badge platform-${platform}">
              <i class="fab fa-${platform === 'youtube' ? 'youtube' : platform === 'tiktok' ? 'tiktok' : platform === 'instagram' ? 'instagram' : 'facebook'}"></i>
              ${platform.charAt(0).toUpperCase() + platform.slice(1)}
            </span>
          </td>
          <td><span class="subscriber-count">${subscribers}</span></td>
          <td>${promoterData.videos || 0}</td>
          <td><span class="status-badge ${statusClass}">${status}</span></td>
          <td>${dateStr}</td>
          <td>
            <div class="promoter-actions">
              <button class="btn" onclick="editPromoter('${docSnap.id}')">
                <i class="fas fa-edit"></i> Edit
              </button>
              <button class="btn btn-danger" onclick="deletePromoter('${docSnap.id}')">
                <i class="fas fa-trash"></i> Delete
              </button>
            </div>
          </td>
        </tr>
      `);
    });
    
    tbody.dataset.allRows = JSON.stringify(rows);
    tbody.innerHTML = rows.length ? rows.join('') : '<tr><td colspan="7"><div class="promoters-empty"><i class="fas fa-users"></i><h3>No Promoters Found</h3><p>Start by adding your first promoter to get started.</p><button class="btn btn-success" onclick="openAddPromoterModal()"><i class="fas fa-plus"></i> Add Promoter</button></div></td></tr>';
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="7"><div class="promoters-empty"><i class="fas fa-exclamation-triangle"></i><h3>Error Loading Promoters</h3><p>There was an error loading the promoters. Please try again.</p><button class="btn" onclick="loadPromoters()"><i class="fas fa-sync-alt"></i> Retry</button></div></td></tr>';
  }
}

function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

async function fetchPromoterInfo(url) {
  try {
    showToast('Fetching promoter information...', 'info');
    
    // Extract platform and ID from URL
    let platform = '';
    let channelId = '';
    
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      platform = 'youtube';
      // Extract channel ID from YouTube URL
      const match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
      if (match) {
        channelId = match[1];
      }
    } else if (url.includes('tiktok.com')) {
      platform = 'tiktok';
      // Extract username from TikTok URL
      const match = url.match(/tiktok\.com\/@([^\/\?]+)/);
      if (match) {
        channelId = match[1];
      }
    } else if (url.includes('instagram.com')) {
      platform = 'instagram';
      const match = url.match(/instagram\.com\/([^\/\?]+)/);
      if (match) {
        channelId = match[1];
      }
    } else {
      throw new Error('Unsupported platform. Please use YouTube, TikTok, or Instagram URLs.');
    }
    
    // For demo purposes, we'll create mock data
    // In a real implementation, you would use APIs like YouTube Data API, TikTok API, etc.
    const mockData = {
      name: channelId.charAt(0).toUpperCase() + channelId.slice(1),
      platform: platform,
      profilePicture: `https://via.placeholder.com/200x200/667eea/ffffff?text=${channelId.charAt(0).toUpperCase()}`,
      subscribers: Math.floor(Math.random() * 1000000) + 1000,
      videos: Math.floor(Math.random() * 500) + 10,
      url: url
    };
    
    // Populate the form with fetched data
    document.getElementById('promoterName').value = mockData.name;
    document.getElementById('promoterPlatform').value = mockData.platform;
    document.getElementById('promoterProfilePicture').value = mockData.profilePicture;
    document.getElementById('promoterSubscribers').value = mockData.subscribers;
    document.getElementById('promoterVideos').value = mockData.videos;
    document.getElementById('promoterUrl').value = mockData.url;
    
    // Show profile picture preview
    const preview = document.getElementById('promoterImagePreview');
    if (preview) {
      preview.src = mockData.profilePicture;
      preview.style.display = 'block';
    }
    
    showToast('Promoter information fetched successfully!', 'success');
    
  } catch (error) {
    console.error('Error fetching promoter info:', error);
    showToast('Error fetching promoter information: ' + error.message, 'error');
  }
}

async function editPromoter(promoterId) {
  try {
    const promoterDoc = await getDoc(doc(db, 'promoters', promoterId));
    if (!promoterDoc.exists()) {
      showToast('Promoter not found', 'error');
      return;
    }
    
    const promoter = promoterDoc.data();
    
    // Populate edit form fields
    document.getElementById('editPromoterId').value = promoterId;
    document.getElementById('editPromoterName').value = promoter.name || '';
    document.getElementById('editPromoterPlatform').value = promoter.platform || '';
    document.getElementById('editPromoterProfilePicture').value = promoter.profilePicture || '';
    document.getElementById('editPromoterSubscribers').value = promoter.subscribers || '';
    document.getElementById('editPromoterVideos').value = promoter.videos || '';
    document.getElementById('editPromoterUrl').value = promoter.url || '';
    document.getElementById('editPromoterStatus').value = promoter.isActive ? 'active' : 'inactive';
    
    // Show profile picture preview
    const editPreview = document.getElementById('editPromoterImagePreview');
    if (editPreview && promoter.profilePicture) {
      editPreview.src = promoter.profilePicture;
      editPreview.style.display = 'block';
    }
    
    // Show edit modal
    openEditPromoterModal();
    
  } catch (error) {
    console.error('Error loading promoter for edit:', error);
    showToast('Failed to load promoter details', 'error');
  }
}

async function deletePromoter(promoterId) {
  if (!confirm('Are you sure you want to delete this promoter? This action cannot be undone.')) {
    return;
  }
  
  try {
    await deleteDoc(doc(db, 'promoters', promoterId));
    showToast('Promoter deleted successfully', 'success');
    loadPromoters();
  } catch (error) {
    console.error('Error deleting promoter:', error);
    showToast('Error deleting promoter', 'error');
    }
}

// Setup promoter form submission
function setupPromoterForm() {
    const promoterForm = document.getElementById('promoterForm');
    if (promoterForm) {
        promoterForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = {
                name: document.getElementById('promoterName').value.trim(),
                platform: document.getElementById('promoterPlatform').value,
                profilePicture: document.getElementById('promoterProfilePicture').value.trim(),
                subscribers: parseInt(document.getElementById('promoterSubscribers').value) || 0,
                videos: parseInt(document.getElementById('promoterVideos').value) || 0,
                url: document.getElementById('promoterUrl').value.trim(),
                isActive: true,
                createdAt: serverTimestamp()
            };
            
            try {
                // Add new promoter
                await addDoc(promotersCol, formData);
                
                showToast('Promoter added successfully!', 'success');
                closeAddPromoterModal();
                loadPromoters();
                
            } catch (error) {
                console.error('Error adding promoter:', error);
                showToast('Failed to add promoter', 'error');
    }
  });
}

    // Setup edit promoter form submission
    const editPromoterForm = document.getElementById('editPromoterForm');
    if (editPromoterForm) {
        editPromoterForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const promoterId = document.getElementById('editPromoterId').value;
            if (!promoterId) {
                showToast('Promoter ID not found', 'error');
                return;
            }
            
            const formData = {
                name: document.getElementById('editPromoterName').value.trim(),
                platform: document.getElementById('editPromoterPlatform').value,
                profilePicture: document.getElementById('editPromoterProfilePicture').value.trim(),
                subscribers: parseInt(document.getElementById('editPromoterSubscribers').value) || 0,
                videos: parseInt(document.getElementById('editPromoterVideos').value) || 0,
                url: document.getElementById('editPromoterUrl').value.trim(),
                isActive: document.getElementById('editPromoterStatus').value === 'active',
                updatedAt: serverTimestamp()
            };
            
            try {
                // Update promoter document
                await updateDoc(doc(db, 'promoters', promoterId), formData);
                
                showToast('Promoter updated successfully!', 'success');
                closeEditPromoterModal();
                loadPromoters();
                
            } catch (error) {
                console.error('Error updating promoter:', error);
                showToast('Failed to update promoter', 'error');
            }
        });
    }
}

// Promoter Modal Functions
function openAddPromoterModal() {
    document.getElementById('addPromoterModal').style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function closeAddPromoterModal() {
    document.getElementById('addPromoterModal').style.display = 'none';
    document.body.style.overflow = 'auto';
    document.getElementById('promoterForm').reset();
    document.getElementById('promoterImagePreview').style.display = 'none';
}

function openEditPromoterModal() {
    document.getElementById('editPromoterModal').style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function closeEditPromoterModal() {
    document.getElementById('editPromoterModal').style.display = 'none';
    document.body.style.overflow = 'auto';
    document.getElementById('editPromoterForm').reset();
    document.getElementById('editPromoterImagePreview').style.display = 'none';
}

function deletePromoterFromEdit() {
    const promoterId = document.getElementById('editPromoterId').value;
    if (promoterId) {
        closeEditPromoterModal();
        deletePromoter(promoterId);
    }
}

// Global functions for onclick handlers - moved to end of file
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
      <div class="form-group">
        <label>Label (e.g. 1000 V-Bucks)</label>
        <input type="text" class="variant-label" placeholder="1000 V-Bucks" required>
      </div>
      <div class="form-group">
        <label>Cost Price (CP) - Rs</label>
        <input type="number" class="variant-cp" step="0.01" placeholder="5.00" required>
      </div>
      <div class="form-group">
        <label>Selling Price (SP) - Rs</label>
        <input type="number" class="variant-sp" step="0.01" placeholder="7.99" required>
      </div>
      <div class="form-group">
        <label>Profit Margin</label>
        <input type="text" class="variant-margin" readonly placeholder="Auto-calculated">
      </div>
      <button type="button" class="remove-variant" onclick="removeVariant(this)">×</button>
    </div>
  `;
  container.appendChild(variantItem);
  
  // Add event listeners for auto-calculation
  const cpInput = variantItem.querySelector('.variant-cp');
  const spInput = variantItem.querySelector('.variant-sp');
  const marginInput = variantItem.querySelector('.variant-margin');
  
  function calculateMargin() {
    const cp = parseFloat(cpInput.value) || 0;
    const sp = parseFloat(spInput.value) || 0;
    if (cp > 0 && sp > 0) {
      const margin = (sp - cp).toFixed(2);
      marginInput.value = `Rs ${margin}`;
    } else {
      marginInput.value = '';
    }
  }
  
  cpInput.addEventListener('input', calculateMargin);
  spInput.addEventListener('input', calculateMargin);
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
  debugUserAccess(); // Debug user access
  document.getElementById('refreshUsersBtn')?.addEventListener('click', loadUsers);
  
  // Setup Add User form
  const addUserForm = document.getElementById('addUserForm');
  if (addUserForm) {
    addUserForm.addEventListener('submit', createUser);
  }
  
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
  
  // Setup promoter management
    console.log('Setting up promoter management...');
  loadPromoters();
  setupPromoterForm();
  document.getElementById('refreshPromotersBtn')?.addEventListener('click', loadPromoters);
  
  // Setup code management
  console.log('Setting up code management...');
  initializeCodeManagement();
  const promotersSearch = document.getElementById('searchPromotersInput');
  if (promotersSearch) {
      promotersSearch.addEventListener('input', () => {
          const tbody = document.querySelector('#promotersTable tbody');
          const q = promotersSearch.value.trim().toLowerCase();
          const all = JSON.parse(tbody?.dataset?.allRows || '[]');
          if (!q) { tbody.innerHTML = all.join(''); return; }
          const filtered = all.filter(html => html.toLowerCase().includes(q));
          tbody.innerHTML = filtered.length ? filtered.join('') : '<tr><td colspan="7">No matches.</td></tr>';
      });
  }
  
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

// Export all functions to global scope
window.addVariant = addVariant;
window.addExtraField = addExtraField;
window.editProduct = editProduct;
window.cancelAddProduct = cancelAddProduct;
window.deleteProduct = deleteProduct;
window.updateUserRole = updateUserRole;
window.viewUserDetails = viewUserDetails;
window.saveUserDetails = saveUserDetails;
window.viewContactMessage = viewContactMessage;
window.viewBase64Image = viewBase64Image;
window.debugUserAccess = debugUserAccess;
window.editCoupon = editCoupon;
window.deleteCoupon = deleteCoupon;
window.openEditCouponModal = openEditCouponModal;
window.closeEditCouponModal = closeEditCouponModal;
window.deleteCouponFromEdit = deleteCouponFromEdit;
window.showCouponUsageDetails = showCouponUsageDetails;
window.closeCouponUsageModal = closeCouponUsageModal;
window.editPromoter = editPromoter;
window.deletePromoter = deletePromoter;
window.openAddPromoterModal = openAddPromoterModal;
window.closeAddPromoterModal = closeAddPromoterModal;
window.openEditPromoterModal = openEditPromoterModal;
window.closeEditPromoterModal = closeEditPromoterModal;
window.deletePromoterFromEdit = deletePromoterFromEdit;
window.fetchPromoterInfo = fetchPromoterInfo;

// Code Management Functions
let generatedCodes = [];

// Generate 16-digit alphanumeric code
function generateCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 16; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Show code tab
function showCodeTab(tab) {
    // Hide all tab contents
    document.querySelectorAll('.code-tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    // Remove active class from all buttons
    document.querySelectorAll('.code-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected tab content
    document.getElementById(tab + 'CodeTab').classList.add('active');
    
    // Add active class to clicked button
    event.target.classList.add('active');
}

// Create scratch card codes
async function createSpinCodes() {
    const form = document.getElementById('createSpinCodeForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const quantity = parseInt(document.getElementById('spinCodeQuantity').value);
        const expiryDays = parseInt(document.getElementById('spinCodeExpiry').value);
        const description = document.getElementById('spinCodeDescription').value;
        
        if (quantity > 100) {
            showToast('Maximum 100 codes can be generated at once', 'error');
            return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';

        try {
            const codes = [];
            const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

            // Generate codes
            const existingCodes = new Set();
            for (let i = 0; i < quantity; i++) {
                let code;
                let attempts = 0;
                
                // Ensure unique codes
                do {
                    code = generateCode();
                    attempts++;
                    if (attempts > 100) {
                        throw new Error('Failed to generate unique code after 100 attempts');
                    }
                } while (existingCodes.has(code));
                
                existingCodes.add(code);
                codes.push({
                    code,
                    amount: 0, // Placeholder - actual reward is random when scratched
                    type: 'spin',
                    expiresAt,
                    description
                });
            }

            // Save to database
            const currentUser = auth.currentUser;
            if (!currentUser) {
                throw new Error('User not authenticated');
            }

            for (const codeData of codes) {
                // Check if code already exists in database
                const existingCodeQuery = query(
                    collection(db, 'spinCodes'),
                    where('code', '==', codeData.code)
                );
                const existingCodeSnap = await getDocs(existingCodeQuery);
                
                if (!existingCodeSnap.empty) {
                    console.warn(`Code ${codeData.code} already exists, skipping...`);
                    continue;
                }
                
                await addDoc(collection(db, 'spinCodes'), {
                    userId: currentUser.uid, // Admin's user ID
                    code: codeData.code,
                    amount: codeData.amount, // 0 as placeholder
                    type: 'spin',
                    isUsed: false,
                    createdAt: serverTimestamp(),
                    expiresAt: codeData.expiresAt,
                    createdBy: 'admin',
                    description: codeData.description || ''
                });
            }

            // Display generated codes
            displayGeneratedCodes(codes);
            showToast(`Successfully generated ${quantity} scratch card codes`, 'success');
            
            // Reset form
            form.reset();
            document.getElementById('spinCodeQuantity').value = 1;
            document.getElementById('spinCodeExpiry').value = 30;

        } catch (error) {
            console.error('Error creating scratch card codes:', error);
            showToast('Error creating scratch card codes', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    });
}

// Create store balance codes
async function createBalanceCodes() {
    const form = document.getElementById('createBalanceCodeForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const amount = parseFloat(document.getElementById('balanceAmount').value);
        const quantity = parseInt(document.getElementById('balanceCodeQuantity').value);
        const expiryDays = parseInt(document.getElementById('balanceCodeExpiry').value);
        const description = document.getElementById('balanceCodeDescription').value;
        
        if (quantity > 100) {
            showToast('Maximum 100 codes can be generated at once', 'error');
            return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';

        try {
            const codes = [];
            const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

            // Generate codes
            for (let i = 0; i < quantity; i++) {
                const code = generateCode();
                codes.push({
                    code,
                    amount,
                    type: 'balance',
                    expiresAt,
                    description
                });
            }

            // Save to database
            const currentUser = auth.currentUser;
            if (!currentUser) {
                throw new Error('User not authenticated');
            }

            for (const codeData of codes) {
                await addDoc(collection(db, 'balanceCodes'), {
                    userId: currentUser.uid, // Admin's user ID
                    code: codeData.code,
                    amount: codeData.amount,
                    type: 'balance',
                    isUsed: false,
                    createdAt: serverTimestamp(),
                    expiresAt: codeData.expiresAt,
                    createdBy: 'admin',
                    description: codeData.description || ''
                });
            }

            // Display generated codes
            displayGeneratedCodes(codes);
            showToast(`Successfully generated ${quantity} store balance codes`, 'success');
            
            // Reset form
            form.reset();
            document.getElementById('balanceCodeQuantity').value = 1;
            document.getElementById('balanceCodeExpiry').value = 30;

        } catch (error) {
            console.error('Error creating balance codes:', error);
            showToast('Error creating balance codes', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    });
}

// Display generated codes
function displayGeneratedCodes(codes) {
    const section = document.getElementById('generatedCodesSection');
    const list = document.getElementById('codesList');
    
    if (!section || !list) return;

    generatedCodes = codes;
    
    list.innerHTML = codes.map(code => `
        <div class="code-item">
            <div>
                <div class="code-value">${code.code}</div>
                <div class="code-amount">${code.type === 'spin' ? 'Random Reward (Rs 1-1000)' : `Rs ${code.amount}`} - ${code.type === 'spin' ? 'Scratch Card' : 'Store Balance'}</div>
            </div>
            <button class="copy-code-btn" onclick="copyCode('${code.code}')">
                <i class="fas fa-copy"></i> Copy
            </button>
        </div>
    `).join('');

    section.style.display = 'block';
    section.scrollIntoView({ behavior: 'smooth' });
}

// Copy single code
function copyCode(code) {
    navigator.clipboard.writeText(code).then(() => {
        showToast('Code copied to clipboard', 'success');
    }).catch(err => {
        console.error('Failed to copy code:', err);
        showToast('Failed to copy code', 'error');
    });
}

// Copy all generated codes
function copyAllCodes() {
    if (generatedCodes.length === 0) {
        showToast('No codes to copy', 'info');
        return;
    }

    const codesText = generatedCodes.map(code => 
        `${code.code} - ${code.type === 'spin' ? 'Random Reward (Rs 1-1000)' : `Rs ${code.amount}`} (${code.type === 'spin' ? 'Scratch Card' : 'Store Balance'})`
    ).join('\n');

    navigator.clipboard.writeText(codesText).then(() => {
        showToast('All codes copied to clipboard', 'success');
    }).catch(err => {
        console.error('Failed to copy codes:', err);
        showToast('Failed to copy codes', 'error');
    });
}

// Load all codes for management
async function loadAllCodes() {
    const table = document.getElementById('allCodesTable');
    if (!table) return;

    const tbody = table.querySelector('tbody');
    tbody.innerHTML = '<tr><td colspan="8">Loading codes...</td></tr>';

    try {
        // Load spin codes
        const spinQuery = query(
            collection(db, 'spinCodes'),
            orderBy('createdAt', 'desc'),
            limit(100)
        );
        const spinSnap = await getDocs(spinQuery);

        // Load balance codes
        const balanceQuery = query(
            collection(db, 'balanceCodes'),
            orderBy('createdAt', 'desc'),
            limit(100)
        );
        const balanceSnap = await getDocs(balanceQuery);

        const allCodes = [];

        // Process spin codes
        spinSnap.forEach(doc => {
            const data = doc.data();
            allCodes.push({
                id: doc.id,
                ...data,
                collection: 'spinCodes'
            });
        });

        // Process balance codes
        balanceSnap.forEach(doc => {
            const data = doc.data();
            allCodes.push({
                id: doc.id,
                ...data,
                collection: 'balanceCodes'
            });
        });

        // Sort by creation date
        allCodes.sort((a, b) => {
            const aTime = a.createdAt?.toDate?.() || new Date(0);
            const bTime = b.createdAt?.toDate?.() || new Date(0);
            return bTime - aTime;
        });

        // Filter codes
        const typeFilter = document.getElementById('codeTypeFilter')?.value || 'all';
        const statusFilter = document.getElementById('codeStatusFilter')?.value || 'all';

        const filteredCodes = allCodes.filter(code => {
            // Type filter
            if (typeFilter !== 'all') {
                if (typeFilter === 'spin' && code.collection !== 'spinCodes') return false;
                if (typeFilter === 'balance' && code.collection !== 'balanceCodes') return false;
            }

            // Status filter
            if (statusFilter !== 'all') {
                const now = new Date();
                const expiresAt = code.expiresAt?.toDate?.() || new Date(0);
                
                if (statusFilter === 'unused' && (code.isUsed || now > expiresAt)) return false;
                if (statusFilter === 'used' && !code.isUsed) return false;
                if (statusFilter === 'expired' && now <= expiresAt) return false;
            }

            return true;
        });

        // Display codes
        if (filteredCodes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8">No codes found</td></tr>';
            return;
        }

        tbody.innerHTML = filteredCodes.map(code => {
            const now = new Date();
            const expiresAt = code.expiresAt?.toDate?.() || new Date(0);
            const createdAt = code.createdAt?.toDate?.() || new Date(0);

            let status = 'unused';
            if (code.isUsed) {
                status = 'used';
            } else if (now > expiresAt) {
                status = 'expired';
            }

            return `
                <tr>
                    <td><code>${code.code}</code></td>
                    <td><span class="code-type ${code.collection === 'spinCodes' ? 'spin' : 'balance'}">${code.collection === 'spinCodes' ? 'Spin' : 'Balance'}</span></td>
                    <td>Rs ${code.amount}</td>
                    <td><span class="code-status ${status}">${status}</span></td>
                    <td>${createdAt.toLocaleDateString()}</td>
                    <td>${expiresAt.toLocaleDateString()}</td>
                    <td>${code.usedBy || 'N/A'}</td>
                    <td>
                        <button class="btn btn-sm" onclick="copyCode('${code.code}')" title="Copy Code">
                            <i class="fas fa-copy"></i>
                        </button>
                        ${!code.isUsed && now <= expiresAt ? `
                            <button class="btn btn-sm btn-danger" onclick="deleteCode('${code.id}', '${code.collection}')" title="Delete Code">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : ''}
                    </td>
                </tr>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading codes:', error);
        tbody.innerHTML = '<tr><td colspan="8">Error loading codes</td></tr>';
        showToast('Error loading codes', 'error');
    }
}

// Delete code
async function deleteCode(codeId, collection) {
    if (!confirm('Are you sure you want to delete this code? This action cannot be undone.')) {
        return;
    }

    try {
        await deleteDoc(doc(db, collection, codeId));
        showToast('Code deleted successfully', 'success');
        loadAllCodes();
    } catch (error) {
        console.error('Error deleting code:', error);
        showToast('Error deleting code', 'error');
    }
}

// Load wallet top-ups
async function loadWalletTopups() {
    const table = document.getElementById('walletTopupsTable');
    const tbody = document.querySelector('#walletTopupsTable tbody');
    
    if (!table || !tbody) return;

    // Show the table
    table.style.display = 'table';
    
    // Hide other tables
    document.querySelectorAll('table').forEach(t => {
        if (t.id !== 'walletTopupsTable') {
            t.style.display = 'none';
        }
    });

    try {
        tbody.innerHTML = '<tr><td colspan="9">Loading wallet top-ups...</td></tr>';

        const topupsSnapshot = await getDocs(collection(db, 'walletTopups'));
        const topups = topupsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        if (topups.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9">No wallet top-up requests found</td></tr>';
            return;
        }

        // Sort by creation date (newest first)
        topups.sort((a, b) => {
            const aTime = a.createdAt?.toDate() || new Date(0);
            const bTime = b.createdAt?.toDate() || new Date(0);
            return bTime - aTime;
        });

        tbody.innerHTML = topups.map(topup => {
            const createdAt = topup.createdAt?.toDate() || new Date();
            const submittedAt = topup.submittedAt?.toDate() || null;
            
            return `
                <tr>
                    <td><code>${topup.id}</code></td>
                    <td>${topup.userName || 'N/A'}</td>
                    <td>${topup.userEmail || 'N/A'}</td>
                    <td>Rs ${topup.amount}</td>
                    <td>${topup.paymentMethod}</td>
                    <td><span class="status-badge ${topup.status}">${topup.status}</span></td>
                    <td>${submittedAt ? submittedAt.toLocaleDateString() : 'Not submitted'}</td>
                    <td>
                        ${topup.screenshot || (topup.paymentScreenshotUrl && topup.paymentScreenshotUrl !== 'MANUAL_VERIFICATION_REQUIRED') ? 
                            `<button class="btn btn-sm" onclick="viewWalletTopupScreenshot('${topup.screenshot || topup.paymentScreenshotUrl}')" title="View Screenshot">
                                <i class="fas fa-image"></i>
                            </button>` : 
                            '<span class="text-muted">No screenshot</span>'
                        }
                    </td>
                    <td>
                        ${topup.status === 'pending' || topup.status === 'pending_verification' ? `
                            <button class="btn btn-sm btn-success" onclick="approveWalletTopup('${topup.id}', '${topup.userId}', ${topup.amount})" title="Approve">
                                <i class="fas fa-check"></i>
                            </button>
                            <button class="btn btn-sm btn-danger" onclick="rejectWalletTopup('${topup.id}')" title="Reject">
                                <i class="fas fa-times"></i>
                            </button>
                        ` : ''}
                        ${topup.status === 'approved' ? '<span class="text-success">Approved</span>' : ''}
                        ${topup.status === 'rejected' ? '<span class="text-danger">Rejected</span>' : ''}
                    </td>
                </tr>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading wallet top-ups:', error);
        tbody.innerHTML = '<tr><td colspan="9">Error loading wallet top-ups</td></tr>';
        showToast('Error loading wallet top-ups', 'error');
    }
}

// View payment screenshot
function viewScreenshot(imageUrl) {
    window.open(imageUrl, '_blank');
}

// View wallet top-up screenshot (handles both base64 and URLs)
function viewWalletTopupScreenshot(imageData) {
    if (!imageData) return;
    
    if (imageData.startsWith('data:image')) {
        // Base64 image - show in modal
        const modal = document.getElementById('orderDetailsModal');
        if (!modal) return;
        
        modal.innerHTML = `
            <div class="modal-header">
                <h3>Payment Screenshot</h3>
                <button class="close-modal" onclick="closeOrderDetailsModal()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="screenshot-viewer">
                    <img src="${imageData}" alt="Payment Screenshot" style="max-width: 100%; height: auto; border-radius: 10px;">
                </div>
            </div>
        `;
        
        modal.style.display = 'block';
    } else {
        // URL - open in new tab
        window.open(imageData, '_blank');
    }
}

// Approve wallet top-up
async function approveWalletTopup(topupId, userId, amount) {
    if (!confirm(`Are you sure you want to approve this wallet top-up of Rs ${amount}?`)) {
        return;
    }

    try {
        // Update top-up status
        await updateDoc(doc(db, 'walletTopups', topupId), {
            status: 'approved',
            approvedAt: serverTimestamp(),
            approvedBy: auth.currentUser.uid
        });

        // Add amount to user's wallet
        const userRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userRef);
        
        if (userDoc.exists()) {
            const currentBalance = userDoc.data().balance || 0;
            const newBalance = currentBalance + amount;
            
            await updateDoc(userRef, {
                balance: newBalance
            });

            // Record wallet transaction
            await addDoc(collection(db, 'walletTransactions'), {
                userId: userId,
                type: 'wallet_topup',
                amount: amount,
                balance: newBalance,
                description: `Wallet top-up approved by admin`,
                createdAt: serverTimestamp(),
                topupId: topupId
            });

            showToast('Wallet top-up approved successfully', 'success');
            loadWalletTopups();
        } else {
            showToast('User not found', 'error');
        }

    } catch (error) {
        console.error('Error approving wallet top-up:', error);
        showToast('Error approving wallet top-up', 'error');
    }
}

// Reject wallet top-up
async function rejectWalletTopup(topupId) {
    if (!confirm('Are you sure you want to reject this wallet top-up request?')) {
        return;
    }

    try {
        await updateDoc(doc(db, 'walletTopups', topupId), {
            status: 'rejected',
            rejectedAt: serverTimestamp(),
            rejectedBy: auth.currentUser.uid
        });

        showToast('Wallet top-up rejected', 'success');
        loadWalletTopups();

    } catch (error) {
        console.error('Error rejecting wallet top-up:', error);
        showToast('Error rejecting wallet top-up', 'error');
    }
}

// Initialize code management
function initializeCodeManagement() {
    createSpinCodes();
    createBalanceCodes();
    loadAllCodes();

    // Add filter event listeners
    const typeFilter = document.getElementById('codeTypeFilter');
    const statusFilter = document.getElementById('codeStatusFilter');

    if (typeFilter) {
        typeFilter.addEventListener('change', loadAllCodes);
    }
    if (statusFilter) {
        statusFilter.addEventListener('change', loadAllCodes);
    }
}

// Make functions globally available
window.showCodeTab = showCodeTab;
window.copyCode = copyCode;
window.copyAllCodes = copyAllCodes;
window.loadAllCodes = loadAllCodes;
window.deleteCode = deleteCode;
window.initializeCodeManagement = initializeCodeManagement;
window.loadWalletTopups = loadWalletTopups;
window.viewScreenshot = viewScreenshot;
window.viewWalletTopupScreenshot = viewWalletTopupScreenshot;
window.approveWalletTopup = approveWalletTopup;
window.rejectWalletTopup = rejectWalletTopup;
