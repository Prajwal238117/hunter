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
        // Enhanced search functionality
        this.searchInput.addEventListener('input', (e) => {
            this.handleSearch(e.target.value);
        });

        // Clear search button
        const clearSearchBtn = document.getElementById('clearSearch');
        if (clearSearchBtn) {
            clearSearchBtn.addEventListener('click', () => {
                this.clearSearch();
            });
        }

        // Sort functionality
        this.sortSelect.addEventListener('change', (e) => {
            this.sortProducts(e.target.value);
        });

        // Close suggestions when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-container')) {
                this.hideSuggestions();
            }
        });

        // Handle search from URL parameters
        this.handleSearchFromURL();
    }

    async loadAllProducts() {
        try {
            const productsRef = collection(db, 'products');
            const q = query(productsRef);
            const querySnapshot = await getDocs(q);
            
            this.allProducts = [];
            querySnapshot.forEach((doc) => {
                const productData = doc.data();
                this.allProducts.push({
                    id: doc.id,
                    ...productData
                });
            });
            
            // Sort products by priority and sales count by default
            this.allProducts.sort((a, b) => {
                // First sort by priority (4 = Very High, 3 = High, 2 = Normal, 1 = Low)
                const priorityDiff = (b.priority || 2) - (a.priority || 2);
                if (priorityDiff !== 0) return priorityDiff;
                
                // Then sort by sales count (high to low)
                const salesDiff = (b.salesCount || 0) - (a.salesCount || 0);
                return salesDiff;
            });
            
            this.filteredProducts = [...this.allProducts];
            this.displayProducts();
            
            // Set default sort selection to priority
            if (this.sortSelect) {
                this.sortSelect.value = 'priority';
            }
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
            case 'priority':
                // Sort by priority first, then by sales count
                this.filteredProducts.sort((a, b) => {
                    const priorityDiff = (b.priority || 2) - (a.priority || 2);
                    if (priorityDiff !== 0) return priorityDiff;
                    return (b.salesCount || 0) - (a.salesCount || 0);
                });
                break;
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

    // Enhanced search methods
    handleSearch(searchTerm) {
        if (!searchTerm.trim()) {
            this.clearSearch();
            return;
        }

        // Show clear button
        const clearSearchBtn = document.getElementById('clearSearch');
        if (clearSearchBtn) {
            clearSearchBtn.style.display = 'flex';
        }

        // Filter products
        this.filterProducts(searchTerm);
        
        // Show search suggestions
        this.showSearchSuggestions(searchTerm);
        
        // Update URL
        this.updateSearchURL(searchTerm);
    }

    clearSearch() {
        this.searchInput.value = '';
        this.filteredProducts = [...this.allProducts];
        this.displayProducts();
        
        // Hide clear button
        const clearSearchBtn = document.getElementById('clearSearch');
        if (clearSearchBtn) {
            clearSearchBtn.style.display = 'none';
        }
        
        // Hide suggestions
        this.hideSuggestions();
        
        // Clear URL
        this.updateSearchURL('');
    }

    showSearchSuggestions(searchTerm) {
        const suggestionsContainer = document.getElementById('searchSuggestions');
        if (!suggestionsContainer) return;

        const suggestions = this.getSearchSuggestions(searchTerm);
        
        if (suggestions.length === 0) {
            suggestionsContainer.style.display = 'none';
            return;
        }

        const suggestionsHTML = suggestions.map(suggestion => `
            <div class="search-suggestion-item" onclick="this.parentElement.parentElement.querySelector('#productsSearch').value = '${suggestion.text}'; this.parentElement.parentElement.querySelector('#productsSearch').dispatchEvent(new Event('input')); this.parentElement.style.display = 'none';">
                <i class="fas fa-search suggestion-icon"></i>
                <div class="suggestion-text">${suggestion.text}</div>
                <div class="suggestion-category">${suggestion.category}</div>
            </div>
        `).join('');

        suggestionsContainer.innerHTML = suggestionsHTML;
        suggestionsContainer.style.display = 'block';
    }

    getSearchSuggestions(searchTerm) {
        const term = searchTerm.toLowerCase();
        const suggestions = [];
        const seen = new Set();

        // Get product names
        this.allProducts.forEach(product => {
            const name = product.name || product.productName || '';
            if (name.toLowerCase().includes(term) && !seen.has(name)) {
                suggestions.push({ text: name, category: 'Product' });
                seen.add(name);
            }
        });

        // Get categories
        const categories = ['Game Top-up', 'Gift Card', 'Subscription'];
        categories.forEach(category => {
            if (category.toLowerCase().includes(term)) {
                suggestions.push({ text: category, category: 'Category' });
            }
        });

        return suggestions.slice(0, 5); // Limit to 5 suggestions
    }

    hideSuggestions() {
        const suggestionsContainer = document.getElementById('searchSuggestions');
        if (suggestionsContainer) {
            suggestionsContainer.style.display = 'none';
        }
    }

    updateSearchURL(searchTerm) {
        const url = new URL(window.location);
        if (searchTerm.trim()) {
            url.searchParams.set('search', searchTerm);
        } else {
            url.searchParams.delete('search');
        }
        window.history.replaceState({}, '', url);
    }

    displayProducts() {
        if (!this.productsList) return;
        
        // Show search results summary if searching
        const searchTerm = this.searchInput.value.trim();
        let summaryHTML = '';
        
        if (searchTerm) {
            summaryHTML = `
                <div class="search-results-summary">
                    <h3>Search Results</h3>
                    <p>Found ${this.filteredProducts.length} product${this.filteredProducts.length !== 1 ? 's' : ''} for "${searchTerm}"</p>
                </div>
            `;
        }
        
        if (this.filteredProducts.length === 0) {
            this.productsList.innerHTML = `
                ${summaryHTML}
                <div class="no-products">
                    <i class="fas fa-search"></i>
                    <p>No products found matching "${searchTerm}".</p>
                    <button onclick="this.parentElement.parentElement.parentElement.querySelector('#productsSearch').value = ''; this.parentElement.parentElement.parentElement.querySelector('#productsSearch').dispatchEvent(new Event('input'));" class="clear-search-btn">
                        Clear Search
                    </button>
                </div>
            `;
            return;
        }

        const productsHTML = `
            ${summaryHTML}
            <div class="products-grid compact" style="display: flex; flex-wrap: wrap; justify-content: center; gap: 1rem; overflow: visible;">
                ${this.filteredProducts.map(product => this.createProductCard(product)).join('')}
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
        
        // Variants removed from index page display - showing compact style like index page

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
