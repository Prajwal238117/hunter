import { db } from './firebase-config.js';
import { collection, query, orderBy, limit, getDocs, where } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

class TopProducts {
    constructor() {
        this.productsList = document.getElementById('topProductsList');
        this.init();
    }

    async init() {
        try {
            await this.loadTopProducts();
        } catch (error) {
            console.error('Error initializing top products:', error);
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
                console.log('Product data:', productData); // Debug log
                products.push(productData);
            });
        } catch (error) {
            console.log('Error loading products with sales data:', error);
        }
        
        // Priority 2: If no sales data, get top 10 by creation date
        if (products.length === 0) {
            try {
                const productsRef = collection(db, 'products');
                const q = query(productsRef, orderBy('createdAt', 'desc'), limit(10));
                const querySnapshot = await getDocs(q);
                
                querySnapshot.forEach((doc) => {
                    const productData = { id: doc.id, ...doc.data() };
                    console.log('Product data (by date):', productData); // Debug log
                    products.push(productData);
                });
            } catch (error) {
                console.log('Error loading products:', error);
            }
        }
        
        console.log('Total products loaded:', products.length); // Debug log
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
            <div class="products-grid">
                ${products.map(product => this.createProductCard(product)).join('')}
            </div>
            <div class="see-more-container">
                <button class="see-more-btn" onclick="window.location.href='all-products.html'">
                    <i class="fas fa-arrow-right"></i>
                    See More Products
                </button>
            </div>
        `;
        
        this.productsList.innerHTML = productsHTML;
    }

    createProductCard(product) {
        // Check for multiple possible image field names
        const imageUrl = product.imageUrl || product.image || product.imagePath || product.photo || product.thumbnail || '';
        const name = product.name || product.productName || 'Product';
        const description = product.description || product.shortDescription || '';
        const price = product.price || product.basePrice || 'N/A';
        const salesCount = product.salesCount || 0;
        const isHot = salesCount > 10; // Mark as hot if more than 10 sales
        
        // Get the lowest price from variants if available
        let displayPrice = price;
        if (product.variants && product.variants.length > 0) {
            const prices = product.variants.map(v => parseFloat(v.price)).filter(p => !isNaN(p));
            if (prices.length > 0) {
                const minPrice = Math.min(...prices);
                displayPrice = `Rs ${minPrice.toFixed(2)}`;
            }
        } else if (typeof price === 'number') {
            displayPrice = `Rs ${price.toFixed(2)}`;
        }

        // Debug log to see what image data we have
        console.log('Product:', name, 'Image URL:', imageUrl);

        return `
            <div class="product-card" onclick="window.location.href='product-details.html?id=${product.id}'">
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
                    <p class="product-description">${description}</p>
                    <div class="product-meta">
                        <span class="product-price">${displayPrice}</span>
                        ${salesCount > 0 ? `<span class="sales-count">${salesCount} sold</span>` : ''}
                    </div>
                </div>
                <div class="product-overlay">
                    <button class="view-details-btn">
                        <i class="fas fa-eye"></i>
                        View Details
                    </button>
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
