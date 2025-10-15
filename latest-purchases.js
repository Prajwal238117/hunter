import { db } from './firebase-config.js';
import { collection, query, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

class LatestPurchases {
    constructor() {
        this.purchasesList = document.getElementById('latestPurchasesList');
        this.init();
    }

    async init() {
        try {
            await this.loadLatestPurchases();
        } catch (error) {
            this.showError();
        }
    }

    async loadLatestPurchases() {
        try {
            // Load from payments collection for all users
            let purchases = [];
            
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
    
                // Show sample data if access is denied
                purchases = this.getSamplePurchases();
            }
            
            this.displayPurchases(purchases);
        } catch (error) {
            // Show sample data on error
            this.displayPurchases(this.getSamplePurchases());
        }
    }

    getSamplePurchases() {
        return [
            {
                id: 'sample1',
                fullName: 'John Doe',
                orderTotal: 'Rs 500',
                paymentMethod: 'esewa',
                status: 'approved',
                orderStatus: 'delivered',
                orderItems: [{ name: 'PUBG UC' }],
                createdAt: new Date()
            },
            {
                id: 'sample2',
                fullName: 'Jane Smith',
                orderTotal: 'Rs 800',
                paymentMethod: 'khalti',
                status: 'pending',
                orderStatus: 'pending',
                orderItems: [{ name: 'Netflix Gift Card' }],
                createdAt: new Date(Date.now() - 86400000)
            },
            {
                id: 'sample3',
                fullName: 'Mike Johnson',
                orderTotal: 'Rs 1200',
                paymentMethod: 'esewa',
                status: 'approved',
                orderStatus: 'delivered',
                orderItems: [{ name: 'Spotify Premium' }],
                createdAt: new Date(Date.now() - 172800000)
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
                </div>
            `;
            return;
        }

        const tableHTML = `
            <div class="purchases-table-container">
                <table class="purchases-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Product Name</th>
                            <th>Price</th>
                            <th>Payment Method</th>
                            <th>Payment Status</th>
                            <th>Order Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${purchases.map(purchase => this.createPurchaseRow(purchase)).join('')}
                    </tbody>
                </table>
            </div>
        `;
        
        this.purchasesList.innerHTML = tableHTML;
        
        // Trigger marquee after content is loaded
        setTimeout(() => {
            if (window.triggerMarquee) {
                window.triggerMarquee();
            }
        }, 200);
    }

    createPurchaseRow(purchase) {
        const paymentStatus = purchase.status || 'pending';
        const orderStatus = purchase.orderStatus || 'pending';
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
                <td class="customer-name">${customerName}</td>
                <td class="product-name">${itemsText}</td>
                <td class="amount">${cleanAmount}</td>
                <td class="payment-method">
                    <i class="${paymentMethod.icon}"></i>
                    <span>${paymentMethod.name}</span>
                </td>
                <td class="status">
                    <span class="status-badge ${paymentStatus}">${paymentStatus.toUpperCase()}</span>
                </td>
                <td class="status">
                    <span class="status-badge ${orderStatus}">${orderStatus.toUpperCase()}</span>
                </td>
            </tr>
        `;
    }

    getPaymentMethodIcon(method) {
        const methodLower = (method || '').toLowerCase();
        
        if (methodLower.includes('esewa')) {
            return { icon: 'fas fa-mobile-alt', name: 'eSewa' };
        } else if (methodLower.includes('khalti')) {
            return { icon: 'fas fa-wallet', name: 'Khalti' };
        } else if (methodLower.includes('ime')) {
            return { icon: 'fas fa-mobile-alt', name: 'IME Pay' };
        } else {
            return { icon: 'fas fa-credit-card', name: method || 'Unknown' };
        }
    }

    showError() {
        if (this.purchasesList) {
            this.purchasesList.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Unable to load recent purchases.</p>
                    <button onclick="window.location.reload()" class="retry-btn">Retry</button>
                </div>
            `;
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new LatestPurchases();
});
