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
            // Try to load from payments collection
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
                console.log('Payments collection access denied');
                // Don't show any data if access is denied
                purchases = [];
            }
            
            this.displayPurchases(purchases);
        } catch (error) {
            console.error('Error loading latest purchases:', error);
            // Don't show any data on error
            this.displayPurchases([]);
        }
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

        const cardsHTML = `
            <div class="purchases-grid">
                ${purchases.map(purchase => this.createPurchaseCard(purchase)).join('')}
            </div>
        `;
        
        this.purchasesList.innerHTML = cardsHTML;
    }

    createPurchaseCard(purchase) {
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
            <div class="purchase-card">
                <div class="purchase-header">
                    <div class="customer-info">
                        <i class="fas fa-user"></i>
                        <span class="customer-name">${customerName}</span>
                    </div>
                    <div class="purchase-status">
                        <span class="status-badge ${status}">${status.toUpperCase()}</span>
                    </div>
                </div>
                
                <div class="purchase-details">
                    <div class="detail-row">
                        <div class="detail-item">
                            <i class="fas fa-shopping-bag"></i>
                            <span>${itemsText}</span>
                        </div>
                    </div>
                    
                    <div class="detail-row">
                        <div class="detail-item">
                            <i class="fas fa-money-bill-wave"></i>
                            <span class="amount">${cleanAmount}</span>
                        </div>
                        <div class="detail-item">
                            <i class="${paymentMethod.icon}"></i>
                            <span>${paymentMethod.name}</span>
                        </div>
                    </div>
                </div>
                
                <div class="purchase-footer">
                    <div class="purchase-date">
                        <i class="fas fa-clock"></i>
                        <span>${formattedDate}</span>
                    </div>
                </div>
            </div>
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
