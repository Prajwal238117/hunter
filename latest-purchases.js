import { db } from './firebase-config.js';
import { collection, query, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

class LatestPurchases {
    constructor() {
        this.purchasesList = document.getElementById('latestPurchasesList');
        this.init();
    }

    async init() {
        try {
            await this.loadLatestPurchases();
        } catch (error) {
            console.error('Error initializing latest purchases:', error);
            this.showError();
        }
    }

    async loadLatestPurchases() {
        try {
            // Try to load from a public collection first, then fallback to payments
            let purchases = [];
            
            try {
                // First try to get from a public 'public-purchases' collection
                const publicRef = collection(db, 'public-purchases');
                const publicQuery = query(publicRef, orderBy('createdAt', 'desc'), limit(5));
                const publicSnapshot = await getDocs(publicQuery);
                
                if (!publicSnapshot.empty) {
                    publicSnapshot.forEach((doc) => {
                        purchases.push({
                            id: doc.id,
                            ...doc.data()
                        });
                    });
                }
            } catch (publicError) {
                console.log('Public purchases collection not available, trying payments...');
            }
            
            // If no public purchases, try to get from payments (might fail due to permissions)
            if (purchases.length === 0) {
                try {
                    const paymentsRef = collection(db, 'payments');
                    const q = query(paymentsRef, orderBy('createdAt', 'desc'), limit(5));
                    const querySnapshot = await getDocs(q);
                    
                    querySnapshot.forEach((doc) => {
                        purchases.push({
                            id: doc.id,
                            ...doc.data()
                        });
                    });
                } catch (paymentsError) {
                    console.log('Payments collection access denied, showing demo data');
                    // Show demo data if both fail
                    purchases = this.getDemoPurchases();
                }
            }
            
            this.displayPurchases(purchases);
        } catch (error) {
            console.error('Error loading latest purchases:', error);
            // Show demo data as fallback
            const demoPurchases = this.getDemoPurchases();
            this.displayPurchases(demoPurchases);
        }
    }

    getDemoPurchases() {
        return [
            {
                id: 'demo1',
                fullName: 'John Doe',
                email: 'john@example.com',
                orderTotal: 'Rs 1,500',
                paymentMethod: 'eSewa',
                orderItems: [
                    { name: 'Free Fire Diamond', productName: 'Free Fire Diamond' },
                    { name: 'V-Bucks 1000', productName: 'V-Bucks 1000' }
                ],
                status: 'approved',
                createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago
            },
            {
                id: 'demo2',
                fullName: 'Sarah Smith',
                email: 'sarah@example.com',
                orderTotal: 'Rs 2,200',
                paymentMethod: 'Khalti',
                orderItems: [
                    { name: 'Netflix Gift Card', productName: 'Netflix Gift Card' }
                ],
                status: 'approved',
                createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000) // 4 hours ago
            },
            {
                id: 'demo3',
                fullName: 'Mike Johnson',
                email: 'mike@example.com',
                orderTotal: 'Rs 800',
                paymentMethod: 'IME Pay',
                orderItems: [
                    { name: 'PUBG UC', productName: 'PUBG UC' }
                ],
                status: 'pending',
                createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000) // 6 hours ago
            },
            {
                id: 'demo4',
                fullName: 'Lisa Brown',
                email: 'lisa@example.com',
                orderTotal: 'Rs 3,000',
                paymentMethod: 'eSewa',
                orderItems: [
                    { name: 'Steam Gift Card', productName: 'Steam Gift Card' },
                    { name: 'Spotify Premium', productName: 'Spotify Premium' }
                ],
                status: 'approved',
                createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000) // 8 hours ago
            },
            {
                id: 'demo5',
                fullName: 'David Wilson',
                email: 'david@example.com',
                orderTotal: 'Rs 1,200',
                paymentMethod: 'Khalti',
                orderItems: [
                    { name: 'Call of Duty Points', productName: 'Call of Duty Points' }
                ],
                status: 'approved',
                createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000) // 12 hours ago
            }
        ];
    }

    displayPurchases(purchases) {
        if (!this.purchasesList) return;
        
        if (purchases.length === 0) {
            this.purchasesList.innerHTML = `
                <div class="no-purchases">
                    <i class="fas fa-shopping-bag"></i>
                    <p>No recent purchases yet.</p>
                    <button onclick="createTestData()" class="test-data-btn">Create Test Data</button>
                </div>
            `;
            return;
        }

        const tableHTML = `
            <div class="purchases-table-container">
                <table class="purchases-table">
                    <thead>
                        <tr>
                            <th>Customer</th>
                            <th>Products</th>
                            <th>Amount</th>
                            <th>Status</th>
                            <th>Payment</th>
                            <th>Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${purchases.map(purchase => this.createPurchaseRow(purchase)).join('')}
                    </tbody>
                </table>
            </div>
        `;
        
        this.purchasesList.innerHTML = tableHTML;
    }

    createPurchaseRow(purchase) {
        const date = purchase.createdAt?.toDate?.() || new Date(purchase.createdAt) || new Date();
        const formattedDate = date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const status = purchase.status || 'pending';
        const customerName = purchase.fullName || purchase.email || 'Anonymous';
        const amount = purchase.orderTotal || 'N/A';
        const paymentMethod = this.getPaymentMethodIcon(purchase.paymentMethod);
        const items = purchase.orderItems || [];
        const itemNames = items.map(item => item.name || item.productName || 'Unknown Item');
        const itemsText = itemNames.length > 0 ? itemNames.join(', ') : 'Digital Items';
        
        let cleanAmount = amount.toString();
        if (cleanAmount.includes('Rs')) {
            cleanAmount = cleanAmount.replace(/Rs\s*/g, '').trim();
            cleanAmount = `Rs ${cleanAmount}`;
        } else {
            cleanAmount = `Rs ${cleanAmount}`;
        }

        return `
            <tr class="purchase-row">
                <td class="customer-cell">
                    <div class="customer-info">
                        <i class="fas fa-user"></i>
                        <span>${customerName}</span>
                    </div>
                </td>
                <td class="products-cell">
                    <div class="products-info">
                        <i class="fas fa-shopping-bag"></i>
                        <span>${itemsText}</span>
                    </div>
                </td>
                <td class="amount-cell">
                    <span class="amount">${cleanAmount}</span>
                </td>
                <td class="status-cell">
                    <span class="status-badge ${status}">${status.toUpperCase()}</span>
                </td>
                <td class="payment-cell">
                    <div class="payment-info">
                        ${paymentMethod.image ? 
                            `<img src="${paymentMethod.image}" alt="${paymentMethod.name}" class="payment-method-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-block';"><i class="${paymentMethod.icon}" style="display: none;"></i>` : 
                            `<i class="${paymentMethod.icon}"></i>`
                        }
                        <span>${paymentMethod.name}</span>
                    </div>
                </td>
                <td class="date-cell">
                    <div class="date-info">
                        <i class="fas fa-clock"></i>
                        <span>${formattedDate}</span>
                    </div>
                </td>
            </tr>
        `;
    }

    getPaymentMethodIcon(method) {
        const methodLower = (method || '').toLowerCase();
        
        if (methodLower.includes('esewa')) {
            return { icon: 'fas fa-mobile-alt', name: 'eSewa', image: null };
        } else if (methodLower.includes('khalti')) {
            return { icon: 'fas fa-wallet', name: 'Khalti', image: 'khalti.jpg' };
        } else if (methodLower.includes('ime')) {
            return { icon: 'fas fa-mobile-alt', name: 'IME Pay', image: 'khalti.jpg' };
        } else {
            return { icon: 'fas fa-credit-card', name: method || 'Unknown', image: null };
        }
    }

    showError() {
        if (this.purchasesList) {
            this.purchasesList.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Unable to load recent purchases.</p>
                    <button onclick="window.location.reload()" class="test-data-btn">Retry</button>
                </div>
            `;
        }
    }
}

// Create test data function (for debugging)
function createTestData() {
    console.log('Creating test data...');
    // This function can be used to create test data if needed
    alert('Test data creation would be implemented here. Check console for details.');
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new LatestPurchases();
});

// Export for global access
window.createTestData = createTestData;
