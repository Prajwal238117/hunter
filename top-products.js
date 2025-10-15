import { db } from './firebase-config.js';
import { collection, query, orderBy, limit, getDocs, where } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

class TopProducts {
    constructor() {
        this.productsList = document.getElementById('topProductsList');
        this.init();
    }

    async init() {
        try {
            await this.loadTopProducts();
        } catch (error) {
            this.showError();
        }
    }

    async loadTopProducts() {
        let products = [];
        
        // Priority 1: Get top 10 products by salesCount
        try {
            const productsRef = collection(db, 'products');
            const q = query(productsRef, orderBy('salesCount', 'desc'), limit(10));
            const querySnapshot = await getDocs(q);
            
            querySnapshot.forEach((doc) => {
                const productData = { id: doc.id, ...doc.data() };
    
                products.push(productData);
            });
        } catch (error) {
            // Error loading products with sales data
        }
        
        // Priority 2: If no sales data, get top 10 by creation date
        if (products.length === 0) {
            try {
                const productsRef = collection(db, 'products');
                const q = query(productsRef, orderBy('createdAt', 'desc'), limit(10));
                const querySnapshot = await getDocs(q);
                
                querySnapshot.forEach((doc) => {
                    const productData = { id: doc.id, ...doc.data() };
        
                    products.push(productData);
                });
                    } catch (error) {
            // Error loading products
        }
        }
        
        
        this.displayProducts(products);
    }

    displayProducts(products) {
        if (!this.productsList) return;
        
        if (products.length === 0) {
            this.productsList.innerHTML = `
                <div class="no-products">
                    <i class="fas fa-box-open"></i>
                    <p>No products available yet.</p>
                </div>
            `;
            return;
        }

        const productsHTML = `
            <div class="products-grid compact">
                ${products.map(product => this.createProductCard(product)).join('')}
            </div>
        `;
        
        this.productsList.innerHTML = productsHTML;
        
        // Trigger marquee after content is loaded
        setTimeout(() => {
            if (window.triggerMarquee) {
                window.triggerMarquee();
            }
        }, 200);
    }

    createProductCard(product) {
        // Check for multiple possible image field names
        const imageUrl = product.imageUrl || product.image || product.imagePath || product.photo || product.thumbnail || '';
        const name = product.name || product.productName || 'Product';
        const salesCount = product.salesCount || 0;
        const isHot = salesCount > 10; // Mark as hot if more than 10 sales
        
        // Debug log to see what image data we have
        

        return `
            <div class="product-card compact" onclick="window.location.href='product-details.html?id=${product.id}'">
                ${isHot ? '<div class="hot-badge">HOT</div>' : ''}
                <div class="product-image">
                    ${imageUrl ? 
                        `<img src="${imageUrl}" alt="${name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" onload="this.nextElementSibling.style.display='none';">` : 
                        ''
                    }
                    <div class="product-icon" style="${imageUrl ? 'display: none;' : 'display: flex;'}">
                        <i class="fas fa-gamepad"></i>
                    </div>
                </div>
                <div class="product-info">
                    <h3 class="product-name">${name}</h3>
                </div>
            </div>
        `;
    }

    showError() {
        if (this.productsList) {
            this.productsList.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Unable to load top products.</p>
                    <button onclick="window.location.reload()" class="retry-btn">Retry</button>
                </div>
            `;
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new TopProducts();
});
