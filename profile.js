import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, updateProfile, signOut } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js';
import { doc, getDoc, setDoc, collection, query, where, orderBy, limit, getDocs } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js';
import { getWalletBalance } from './wallet.js';
import { showToast } from './toast.js';

function setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text || ''; }
function setValue(id, v) { const el = document.getElementById(id); if (el) el.value = v || ''; }
function getValue(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }

document.addEventListener('DOMContentLoaded', function() {
    // Check authentication state
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            await loadUserProfile(user);
            await loadRecentOrders(user);
            try {
                const bal = await getWalletBalance(user.uid);
                const el = document.getElementById('walletBalance');
                if (el) el.textContent = `Rs ${bal.toFixed(2)}`;
            } catch {}
        } else {
            // Redirect to login if not authenticated
            window.location.href = 'login.html';
        }
    });
});

async function loadUserProfile(user) {
    try {
        // Get user's custom profile data from Firestore
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        
        if (userDoc.exists()) {
            const userData = userDoc.data();
            document.getElementById('profileName').textContent = userData.displayName || user.displayName || 'User';
            document.getElementById('profileEmail').textContent = user.email || '';
        } else {
            // Set default values if no custom profile exists
            document.getElementById('profileName').textContent = user.displayName || 'User';
            document.getElementById('profileEmail').textContent = user.email || '';
        }
    } catch (error) {
        showToast('Error loading profile data', 'error');
    }
}

async function loadRecentOrders(user) {
    try {
        const activityList = document.getElementById('activityList');
        const ordersCountElement = document.getElementById('ordersCount');
        const totalSpentElement = document.getElementById('totalSpent');
        
        // Query payments for this user's email
        // Query latest orders by createdAt and filter by email
        const paymentsRef = collection(db, 'payments');
        let querySnapshot;
        try {
            // Preferred: filter by email and order by createdAt
            const q1 = query(
                paymentsRef,
                where('email', '==', user.email),
                orderBy('createdAt', 'desc'),
                limit(5)
            );
            querySnapshot = await getDocs(q1);
        } catch (orderError) {
            // Fallback when index is missing: query by email only, then sort client-side
            const q2 = query(
                paymentsRef,
                where('email', '==', user.email),
                limit(10)
            );
            querySnapshot = await getDocs(q2);
        }
        const orders = [];
        let totalSpent = 0;
        
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const created = data.createdAt?.toDate?.() || data.timestamp?.toDate?.() || new Date(0);
            orders.push({
                id: doc.id,
                ...data,
                timestamp: created
            });
            // Add to total spent if amount is available
            if (data.orderTotal) {
                const numeric = parseFloat(String(data.orderTotal).replace(/[^0-9.]/g, '')) || 0;
                totalSpent += numeric;
            }
        });
        // If we used the fallback (no orderBy), ensure client-side sort by createdAt desc and take top 5
        orders.sort((a, b) => (b.timestamp?.getTime?.() || 0) - (a.timestamp?.getTime?.() || 0));
        const top = orders.slice(0, 5);
        
        // Update stats
        ordersCountElement.textContent = orders.length;
        totalSpentElement.textContent = `Rs ${totalSpent.toFixed(2)}`;
        
        // Display recent orders with better formatting
        if (top.length > 0) {
            activityList.innerHTML = top.map(order => {
                const orderDate = order.timestamp.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                
                const statusClass = (order.status || 'pending').toLowerCase();
                const statusText = (order.status || 'Pending').charAt(0).toUpperCase() + (order.status || 'Pending').slice(1);
                
                const orderTotal = order.orderTotal || 'N/A';
                
                // Get product names from orderItems array (like in latest-purchases.js)
                const items = order.orderItems || [];
                const itemNames = items.map(item => item.name || item.productName || 'Unknown Item');
                const productName = itemNames.length > 0 ? itemNames.join(', ') : (order.productName || order.product || order.itemName || order.title || 'Digital Items');
                
                return `
                    <div class="order-card">
                        <div class="order-header">
                            <div class="order-id">
                                <i class="fas fa-receipt"></i>
                                <span class="order-id-text marquee"><span class="marquee-text">Order #${order.id.slice(-8)}</span></span>
                            </div>
                            <div class="order-status status-${statusClass}">
                                <i class="fas fa-circle"></i>
                                ${statusText}
                            </div>
                        </div>
                        <div class="order-details">
                            <div class="order-info">
                                <div class="order-product">
                                    <i class="fas fa-box"></i>
                                    <span class="product-name-text marquee"><span class="marquee-text">${productName}</span></span>
                                </div>
                                <div class="order-amount">
                                    <span>${orderTotal}</span>
                                </div>
                            </div>
                            <div class="order-meta">
                                <div class="order-date">
                                    <i class="fas fa-calendar"></i>
                                    <span>${orderDate}</span>
                                </div>
                                ${order.paymentMethod ? `
                                    <div class="order-payment">
                                        <i class="fas fa-credit-card"></i>
                                        <span>${order.paymentMethod}</span>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            activityList.innerHTML = `
                <div class="no-orders">
                    <i class="fas fa-shopping-cart"></i>
                    <p>No recent orders found</p>
                    <a href="all-products.html" class="shop-now-btn">Start Shopping</a>
                </div>
            `;
        }
        
        // Trigger marquee after content is loaded
        setTimeout(() => {
            if (window.triggerMarquee) {
                window.triggerMarquee();
            }
        }, 200);
        
    } catch (error) {
        showToast('Error loading recent orders', 'error');
        document.getElementById('activityList').innerHTML = '<p class="no-orders">Error loading orders.</p>';
    }
}

// Handle profile updates
document.addEventListener('DOMContentLoaded', function() {
    const profileForm = document.getElementById('profileForm');
    if (profileForm) {
        profileForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const user = auth.currentUser;
            if (!user) {
                showToast('You must be logged in to update your profile', 'error');
                return;
            }
            
            try {
                const firstName = document.getElementById('firstNameInput').value;
                const lastName = document.getElementById('lastNameInput').value;
                const phone = document.getElementById('phoneInput').value;
                
                // Update Firebase Auth display name
                await updateProfile(user, {
                    displayName: `${firstName} ${lastName}`.trim()
                });
                
                // Update Firestore user document
                await setDoc(doc(db, 'users', user.uid), {
                    displayName: `${firstName} ${lastName}`.trim(),
                    firstName: firstName,
                    lastName: lastName,
                    phone: phone,
                    email: user.email,
                    updatedAt: new Date()
                }, { merge: true });
                
                // Update profile display
                document.getElementById('profileName').textContent = `${firstName} ${lastName}`.trim();
                
                showToast('Profile updated successfully', 'success');
                
                    } catch (error) {
            showToast('Error updating profile', 'error');
        }
        });
    }
});

// Global logout function
async function logout() {
    try {
        await signOut(auth);
        showToast('Logged out successfully', 'success');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1000);
            } catch (error) {
            showToast('Error logging out', 'error');
        }
}

// Make logout function globally accessible
window.logout = logout;


