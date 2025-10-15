import { db } from './firebase-config.js';
import { collection, query, where, getDocs, orderBy, limit } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { showToast } from './toast.js';

class ProductSearch {
    constructor() {
        this.searchToggle = document.getElementById('searchToggle');
        this.searchOverlay = document.getElementById('searchOverlay');
        this.closeSearch = document.getElementById('closeSearch');
        this.overlaySearchInput = document.getElementById('overlaySearchInput');
        this.overlaySearchBtn = document.getElementById('overlaySearchBtn');
        this.overlaySearchResults = document.getElementById('overlaySearchResults');
        this.products = [];
        this.init();
    }

    async init() {
        await this.loadProducts();
        this.setupEventListeners();
    }

    async loadProducts() {
        try {
            const productsRef = collection(db, 'products');
            const q = query(productsRef, orderBy('name'), limit(100));
            const snapshot = await getDocs(q);
            
            this.products = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            // Error loading products for search
        }
    }

    setupEventListeners() {
        // Overlay search functionality
        if (this.searchToggle) {
            this.searchToggle.addEventListener('click', () => {
                this.openSearchOverlay();
            });
        }

        if (this.closeSearch) {
            this.closeSearch.addEventListener('click', () => {
                this.closeSearchOverlay();
            });
        }

        if (this.overlaySearchInput) {
            this.overlaySearchInput.addEventListener('input', (e) => {
                this.handleOverlaySearch(e.target.value);
            });

            this.overlaySearchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.performOverlaySearch();
                }
            });
        }

        if (this.overlaySearchBtn) {
            this.overlaySearchBtn.addEventListener('click', () => {
                this.performOverlaySearch();
            });
        }

        // Close overlay when clicking outside
        if (this.searchOverlay) {
            this.searchOverlay.addEventListener('click', (e) => {
                if (e.target === this.searchOverlay) {
                    this.closeSearchOverlay();
                }
            });
        }

        // Close overlay with Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.searchOverlay?.classList.contains('active')) {
                this.closeSearchOverlay();
            }
        });
    }

    searchProducts(query) {
        const searchTerm = query.toLowerCase().trim();
        
        return this.products.filter(product => {
            const nameMatch = product.name?.toLowerCase().includes(searchTerm);
            // Category search removed
            const descriptionMatch = product.description?.toLowerCase().includes(searchTerm);
            
            return nameMatch || descriptionMatch;
        }).slice(0, 8); // Limit to 8 results
    }

    // Overlay search methods
    openSearchOverlay() {
        if (this.searchOverlay) {
            this.searchOverlay.classList.add('active');
            setTimeout(() => {
                this.overlaySearchInput?.focus();
            }, 300);
        }
    }

    closeSearchOverlay() {
        if (this.searchOverlay) {
            this.searchOverlay.classList.remove('active');
            if (this.overlaySearchInput) {
                this.overlaySearchInput.value = '';
            }
            this.hideOverlayResults();
        }
    }

    handleOverlaySearch(query) {
        if (!query.trim()) {
            this.hideOverlayResults();
            return;
        }

        const results = this.searchProducts(query);
        this.displayOverlayResults(results);
    }

    displayOverlayResults(results) {
        if (!this.overlaySearchResults) return;

        if (results.length === 0) {
            this.overlaySearchResults.innerHTML = `
                <div class="overlay-no-results">
                    <i class="fas fa-search"></i>
                    <h3>No products found</h3>
                    <p>Try searching with different keywords</p>
                </div>
            `;
            return;
        }

        this.overlaySearchResults.innerHTML = results.map(product => {
            const basePrice = product.variants && product.variants.length > 0 
                ? product.variants[0].price 
                : 'N/A';
            
            return `
                <div class="overlay-search-result-item" onclick="window.location.href='product-details.html?id=${product.id}'">
                    <div class="overlay-search-result-image">
                        ${product.imageUrl || product.imagePath 
                            ? `<img src="${product.imageUrl || product.imagePath}" alt="${product.name}" onerror="this.parentElement.innerHTML='<i class=\\'fas fa-gamepad\\'></i>'">`
                            : `<i class="fas fa-gamepad"></i>`
                        }
                    </div>
                    <div class="overlay-search-result-details">
                        <div class="overlay-search-result-title">${product.name}</div>
                        <div class="overlay-search-result-type">Digital Product</div>
                    </div>
                    <div class="overlay-search-result-price">
                        ${basePrice !== 'N/A' ? `Rs ${basePrice}` : 'N/A'}
                    </div>
                </div>
            `;
        }).join('');
    }

    hideOverlayResults() {
        if (this.overlaySearchResults) {
            this.overlaySearchResults.innerHTML = '';
        }
    }

    performOverlaySearch() {
        const query = this.overlaySearchInput?.value.trim();
        if (!query) {
            showToast('Please enter a search term', 'info');
            return;
        }

        const results = this.searchProducts(query);
        if (results.length === 0) {
            showToast('No products found', 'info');
            return;
        }

        // Store search results and redirect to all products page with search filter
        localStorage.setItem('searchQuery', query);
        localStorage.setItem('searchResults', JSON.stringify(results));
        
        window.location.href = 'all-products.html?search=' + encodeURIComponent(query);
    }
}

// Initialize search when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ProductSearch();
});

export { ProductSearch };
