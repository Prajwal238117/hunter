import { db } from './firebase-config.js';
import { collection, query, orderBy, getDocs, where } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

class AllProducts {
    constructor() {
        this.productsList = document.getElementById('allProductsList');
        this.searchInput = document.getElementById('productsSearch');
        this.sortSelect = document.getElementById('sortSelect');
        this.allProducts = [];
        this.filteredProducts = [];
        
        this.init();
    }

    async init() {
        try {
            await this.loadAllProducts();
            this.setupEventListeners();
            this.handleSearchFromURL();
        } catch (error) {
            console.error('Error initializing all products:', error);
            this.showError();
        }
    }

    setupEventListeners() {
        // Search functionality
        this.searchInput.addEventListener('input', (e) => {
            this.filterProducts(e.target.value);
        });

        // Sort functionality
        this.sortSelect.addEventListener('change', (e) => {
            this.sortProducts(e.target.value);
        });
    }

    async loadAllProducts() {
        try {
            const productsRef = collection(db, 'products');
            const q = query(productsRef, orderBy('createdAt', 'desc'));
            const querySnapshot = await getDocs(q);
            
            this.allProducts = [];
            querySnapshot.forEach((doc) => {
                const productData = doc.data();
                this.allProducts.push({
                    id: doc.id,
                    ...productData
                });
            });
            
            this.filteredProducts = [...this.allProducts];
            this.displayProducts();
        } catch (error) {
            console.error('Error loading all products:', error);
            this.displayProducts([]);
        }
    }

    filterProducts(searchTerm) {
        if (!searchTerm.trim()) {
            this.filteredProducts = [...this.allProducts];
        } else {
            const term = searchTerm.toLowerCase();
            this.filteredProducts = this.allProducts.filter(product => {
                const name = (product.name || product.productName || '').toLowerCase();
                const description = (product.description || product.shortDescription || '').toLowerCase();
                return name.includes(term) || description.includes(term);
            });
        }
        
        this.displayProducts();
    }

    sortProducts(sortBy) {
        switch (sortBy) {
            case 'sales':
                this.filteredProducts.sort((a, b) => (b.salesCount || 0) - (a.salesCount || 0));
                break;
            case 'name':
                this.filteredProducts.sort((a, b) => {
                    const nameA = (a.name || a.productName || '').toLowerCase();
                    const nameB = (b.name || b.productName || '').toLowerCase();
                    return nameA.localeCompare(nameB);
                });
                break;
            case 'price-low':
                this.filteredProducts.sort((a, b) => {
                    const priceA = this.getMinPrice(a);
                    const priceB = this.getMinPrice(b);
                    return priceA - priceB;
                });
                break;
            case 'price-high':
                this.filteredProducts.sort((a, b) => {
                    const priceA = this.getMinPrice(a);
                    const priceB = this.getMinPrice(b);
                    return priceB - priceA;
                });
                break;
            case 'newest':
                this.filteredProducts.sort((a, b) => {
                    const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt) || new Date(0);
                    const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt) || new Date(0);
                    return dateB - dateA;
                });
                break;
        }
        
        this.displayProducts();
    }

    getMinPrice(product) {
        if (product.variants && product.variants.length > 0) {
            const prices = product.variants.map(v => parseFloat(v.price)).filter(p => !isNaN(p));
            return prices.length > 0 ? Math.min(...prices) : 0;
        }
        return parseFloat(product.price || product.basePrice || 0) || 0;
    }

    displayProducts() {
        if (!this.productsList) return;
        
        if (this.filteredProducts.length === 0) {
            this.productsList.innerHTML = `
                <div class="no-products">
                    <i class="fas fa-search"></i>
                    <p>No products found matching your search.</p>
                    <button onclick="this.parentElement.parentElement.parentElement.querySelector('#productsSearch').value = ''; this.parentElement.parentElement.parentElement.querySelector('#productsSearch').dispatchEvent(new Event('input'));" class="clear-search-btn">
                        Clear Search
                    </button>
                </div>
            `;
            return;
        }

        const productsHTML = `
            <div class="products-grid">
                ${this.filteredProducts.map(product => this.createProductCard(product)).join('')}
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
        const isHot = salesCount > 10;
        
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

    handleSearchFromURL() {
        const urlParams = new URLSearchParams(window.location.search);
        const searchQuery = urlParams.get('search');
        
        if (searchQuery && this.searchInput) {
            this.searchInput.value = searchQuery;
            this.filterProducts(searchQuery);
        }
    }

    showError() {
        if (this.productsList) {
            this.productsList.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Unable to load products.</p>
                    <button onclick="window.location.reload()" class="retry-btn">Retry</button>
                </div>
            `;
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new AllProducts();
});
