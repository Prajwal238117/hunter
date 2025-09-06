import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, updateProfile, signOut } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';
import { doc, getDoc, setDoc, collection, query, where, orderBy, limit, getDocs } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
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
        const q = query(
            paymentsRef,
            where('email', '==', user.email),
            orderBy('createdAt', 'desc'),
            limit(5)
        );
        
        const querySnapshot = await getDocs(q);
        const orders = [];
        let totalSpent = 0;
        
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            orders.push({
                id: doc.id,
                ...data,
                timestamp: data.timestamp?.toDate() || new Date()
            });
            // Add to total spent if amount is available
            if (data.orderTotal) {
                const numeric = parseFloat(String(data.orderTotal).replace(/[^0-9.]/g, '')) || 0;
                totalSpent += numeric;
            }
        });
        
        // Update stats
        ordersCountElement.textContent = orders.length;
        totalSpentElement.textContent = `Rs ${totalSpent.toFixed(2)}`;
        
        // Display recent orders
        if (orders.length > 0) {
            activityList.innerHTML = orders.map(order => `
                <div class="activity-item">
                    <div class="activity-icon">
                        <i class="fas fa-shopping-bag"></i>
                    </div>
                    <div class="activity-content">
                        <h4>Order #${order.id.slice(-8)}</h4>
                        <p>${order.productName || 'Product'}</p>
                        <span class="activity-date">${order.timestamp.toLocaleDateString()}</span>
                        <span class="activity-status ${order.status || 'pending'}">${order.status || 'Pending'}</span>
                    </div>
                </div>
            `).join('');
        } else {
            activityList.innerHTML = '<p class="no-orders">No recent orders.</p>';
        }
        
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


