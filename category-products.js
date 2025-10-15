import { db } from './firebase-config.js';
import { collection, query, orderBy, limit, getDocs, where } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

class CategoryProducts {
    constructor() {
        this.gameTopupList = document.getElementById('gameTopupList');
        this.giftCardList = document.getElementById('giftCardList');
        this.subscriptionList = document.getElementById('subscriptionList');
        this.pcGamesList = document.getElementById('pcGamesList');
        this.init();
    }

    async init() {
        try {
            await Promise.all([
                this.loadCategoryProducts('game-topup', this.gameTopupList),
                this.loadCategoryProducts('gift-card', this.giftCardList),
                this.loadCategoryProducts('subscription', this.subscriptionList),
                this.loadCategoryProducts('pc-games', this.pcGamesList)
            ]);
        } catch (error) {
            this.showError();
        }
    }

    async loadCategoryProducts(category, productsList) {
        if (!productsList) return;
        
        let products = [];
        
        try {
            const productsRef = collection(db, 'products');
            let q;
            
    
            
            // Try to get products by category first
            try {
                q = query(productsRef, where('category', '==', category), limit(20));
                const querySnapshot = await getDocs(q);
                
                querySnapshot.forEach((doc) => {
                    const productData = { id: doc.id, ...doc.data() };
                    products.push(productData);
    
                });
                
                        } catch (categoryError) {
            // Error loading products with category
        }
            
            // Sort products by priority and sales count
            if (products.length > 0) {
                products.sort((a, b) => {
                    // First sort by priority (4 = Very High, 3 = High, 2 = Normal, 1 = Low)
                    const priorityDiff = (b.priority || 2) - (a.priority || 2);
                    if (priorityDiff !== 0) return priorityDiff;
                    
                    // Then sort by sales count (high to low)
                    const salesDiff = (b.salesCount || 0) - (a.salesCount || 0);
                    return salesDiff;
                });
                
                // Limit to top 6 products after sorting
                products = products.slice(0, 6);
    
            }
            
            // If no products found by category, try to get by tags or other fields
            if (products.length === 0) {
    
                try {
                    q = query(productsRef, orderBy('createdAt', 'desc'), limit(20));
                    const querySnapshot = await getDocs(q);
                    
                    querySnapshot.forEach((doc) => {
                        const productData = { id: doc.id, ...doc.data() };
                        // Filter by category-related keywords
                        if (this.matchesCategory(productData, category)) {
                            products.push(productData);
                        }
                    });
                    
                    // Sort products by priority and sales count
                    if (products.length > 0) {
                        products.sort((a, b) => {
                            // First sort by priority (4 = Very High, 3 = High, 2 = Normal, 1 = Low)
                            const priorityDiff = (b.priority || 2) - (a.priority || 2);
                            if (priorityDiff !== 0) return priorityDiff;
                            
                            // Then sort by sales count (high to low)
                            const salesDiff = (b.salesCount || 0) - (a.salesCount || 0);
                            return salesDiff;
                        });
                        
                        // Limit to top 6 products after sorting
                        products = products.slice(0, 6);
                                        // Sorted and limited to top 6 products for category (fallback)
            }
        } catch (error) {
            // Error loading products
        }
            }
            
            this.displayCategoryProducts(products, productsList, category);
        } catch (error) {
            this.displayCategoryProducts([], productsList, category);
        }
    }

    matchesCategory(product, category) {
        const productName = (product.name || '').toLowerCase();
        const productDesc = (product.description || '').toLowerCase();
        const productTags = (product.tags || []).map(tag => tag.toLowerCase());
        const productCategory = (product.category || '').toLowerCase();
        
        // First check if the product already has a category assigned
        if (productCategory === category || productCategory === category.replace('-', ' ')) {
            return true;
        }
        
        switch (category) {
            case 'game-topup':
                return productName.includes('game') || 
                       productName.includes('top') || 
                       productName.includes('up') ||
                       productName.includes('uc') ||
                       productName.includes('diamond') ||
                       productName.includes('coin') ||
                       productDesc.includes('game') ||
                       productTags.some(tag => tag.includes('game') || tag.includes('topup') || tag.includes('uc') || tag.includes('diamond'));
            
            case 'gift-card':
                return productName.includes('gift') || 
                       productName.includes('card') ||
                       productName.includes('netflix') ||
                       productName.includes('amazon') ||
                       productName.includes('steam') ||
                       productName.includes('spotify') ||
                       productDesc.includes('gift') ||
                       productTags.some(tag => tag.includes('gift') || tag.includes('card') || tag.includes('netflix') || tag.includes('amazon'));
            
            case 'subscription':
                return productName.includes('subscription') || 
                       productName.includes('monthly') ||
                       productName.includes('yearly') ||
                       productName.includes('premium') ||
                       productName.includes('pro') ||
                       productDesc.includes('subscription') ||
                       productDesc.includes('monthly') ||
                       productTags.some(tag => tag.includes('subscription') || tag.includes('monthly') || tag.includes('premium'));
            
            case 'pc-games':
                return productName.includes('pc') || 
                       productName.includes('computer') ||
                       productName.includes('steam') ||
                       productName.includes('epic') ||
                       productName.includes('origin') ||
                       productName.includes('battle.net') ||
                       productName.includes('uplay') ||
                       productDesc.includes('pc') ||
                       productDesc.includes('computer') ||
                       productDesc.includes('steam') ||
                       productTags.some(tag => tag.includes('pc') || tag.includes('computer') || tag.includes('steam') || tag.includes('epic'));
            
            default:
                return false;
        }
    }

    displayCategoryProducts(products, productsList, category) {
        if (!productsList) return;
        
        if (products.length === 0) {
            // Show no products message instead of fake products
            productsList.innerHTML = `
                <div class="no-products">
                    <i class="fas fa-box-open"></i>
                    <p>No ${category.replace('-', ' ')} products available yet.</p>
                    <small>Products will appear here once they are added through the admin panel.</small>
                </div>
            `;
            return;
        }

        const productsHTML = `
            <div class="products-grid compact">
                ${products.map(product => this.createProductCard(product)).join('')}
            </div>
        `;
        
        productsList.innerHTML = productsHTML;
        
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
        
        // Variants removed from index page display
        


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
        const errorMessage = `
            <div class="error-message">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Unable to load category products.</p>
                <button onclick="window.location.reload()" class="retry-btn">Retry</button>
            </div>
        `;
        
        if (this.gameTopupList) this.gameTopupList.innerHTML = errorMessage;
        if (this.giftCardList) this.giftCardList.innerHTML = errorMessage;
        if (this.subscriptionList) this.subscriptionList.innerHTML = errorMessage;
        if (this.pcGamesList) this.pcGamesList.innerHTML = errorMessage;
    }


}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new CategoryProducts();
});
