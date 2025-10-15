import { db, storage, auth } from './firebase-config.js';
import { collection, getDocs, doc, getDoc, query, where, orderBy, addDoc, limit, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js';
import { ref, getDownloadURL } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-storage.js';
import { showToast } from './toast.js';

class ProductManager {
    constructor() {
        this.products = [];
        this.currentProduct = null;
        this.selectedVariant = null;
        this.init();
    }

    async init() {
        await this.loadProducts();
        this.setupEventListeners();
        this.displayProducts();
    }

    async loadProducts() {
        try {
            const productsRef = collection(db, 'products');
            const q = query(productsRef, orderBy('name'));
            const querySnapshot = await getDocs(q);
            
            this.products = [];
            for (const doc of querySnapshot.docs) {
                const productData = doc.data();
                this.products.push({
                    id: doc.id,
                    ...productData
                });
            }
            
        } catch (error) {
            showToast('Error loading products', 'error');
        }
    }

    async getProductById(productId) {
        try {
            const productDoc = await getDoc(doc(db, 'products', productId));
            if (productDoc.exists()) {
                return {
                    id: productDoc.id,
                    ...productDoc.data()
                };
            }
            return null;
        } catch (error) {
            return null;
        }
    }

    async getProductImageUrl(imagePath) {
        try {
            if (!imagePath) return null;
            const imageRef = ref(storage, imagePath);
            return await getDownloadURL(imageRef);
        } catch (error) {
            return null;
        }
    }

    displayProducts() {
        const productsContainer = document.getElementById('products-container');
        if (!productsContainer) return;

        if (this.products.length === 0) {
            productsContainer.innerHTML = `
                <div class="no-products">
                    <i class="fas fa-box-open"></i>
                    <h3>No Products Available</h3>
                    <p>Check back later for new products!</p>
                </div>
            `;
            return;
        }

        const productsHTML = this.products.map(product => `
            <div class="product-card" data-product-id="${product.id}">
                <div class="product-image">
                    ${ (product.imageUrl || product.imagePath) ?
                        `<img src="${product.imageUrl || product.imagePath}" alt="${product.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                         <i class="fas fa-image" style="display: none; font-size: 3rem; color: #667eea;"></i>` :
                        `<i class="fas fa-image" style="font-size: 3rem; color: #667eea;"></i>`
                    }
                </div>
                <div class="product-info">
                    <h3>${product.name}</h3>
                    <p class="product-description">${product.description.substring(0, 100)}${product.description.length > 100 ? '...' : ''}</p>
                    <div class="product-price">
                        <span class="price">Rs ${product.variants[0]?.price || 'N/A'}</span>
                        ${product.variants.length > 1 ? `<span class="variants-count">+${product.variants.length - 1} more options</span>` : ''}
                    </div>
                    <button class="view-product-btn" onclick="window.location.href='product-details.html?id=${product.id}'">
                        View Details
                    </button>
                </div>
            </div>
        `).join('');

        productsContainer.innerHTML = productsHTML;
    }

    async displayProductDetails(productId) {
        const product = await this.getProductById(productId);
        if (!product) {
            showToast('Product not found', 'error');
            return;
        }



        this.currentProduct = product;
        this.selectedVariant = product.variants?.[0] || null;

        // Update page title
        document.title = `${product.name} - CGAPH`;

        // Update SEO meta tags
        this.updateSEOMetaTags(product);

        // Update breadcrumb
        const breadcrumb = document.querySelector('.breadcrumb span');
        if (breadcrumb) breadcrumb.textContent = product.name;

        // Update product image (supports direct URL like Cloudflare Images)
        const productImage = document.querySelector('.product-image-section .product-image');
        if (productImage) {
            if (product.imageUrl) {
                productImage.innerHTML = `<img src="${product.imageUrl}" alt="${product.name}">`;
            } else if (product.imagePath) {
                // Fallback to stored path string
                productImage.innerHTML = `<img src="${product.imagePath}" alt="${product.name}">`;
            } else {
                productImage.innerHTML = `<i class="fas fa-image" style="font-size: 5rem; color: #667eea;"></i>`;
            }
        }

        // Update product info
        const productTitle = document.querySelector('.product-header h1');
        if (productTitle) productTitle.textContent = product.name;

        const productDesc = document.querySelector('.product-description');
        if (productDesc) productDesc.textContent = product.description;

        // Update product variants
        this.displayVariants(product.variants || []);
        
        // Auto-select first variant if available
        if (product.variants && product.variants.length > 0) {
            this.selectVariant(0);
        }

        // Update selected option display
        this.updateSelectedOption();

        // Update product features
        if (product.features) {
            this.displayFeatures(product.features);
        }

        // Display extra fields if they exist
        if (product.extraFields && product.extraFields.length > 0) {
            this.displayExtraFields(product.extraFields);
        }

        // Update tab content
        if (product.tabContent) {
            this.updateTabContent(product.tabContent);
        }

        // Reviews summary + latest
        const summary = await this.loadReviewAggregate(productId);
        await this.loadLatestReviews(productId);
        this.setupReviewForm(productId);
        const headerStars = document.querySelector('.product-header .product-rating .stars');
        const headerText = document.querySelector('.product-header .product-rating .rating-text');
        if (headerStars) headerStars.innerHTML = this.starIcons(summary.avg || 0);
        if (headerText) headerText.textContent = `${summary.avg ? summary.avg.toFixed(1) : '-'} (${summary.total || 0} reviews)`;
        
        // Initialize cart count display
        this.initializeCartCount();
    }

    updateSEOMetaTags(product) {
        // Update meta title
        const metaTitle = document.getElementById('metaTitle');
        if (metaTitle) {
            metaTitle.setAttribute('content', `${product.name} - Best Price in Nepal | CGAPH`);
        }

        // Update meta description
        const metaDescription = document.getElementById('metaDescription');
        if (metaDescription) {
            const description = product.description.length > 160 
                ? product.description.substring(0, 157) + '...'
                : product.description;
            metaDescription.setAttribute('content', `Buy ${product.name} at the best price in Nepal. ${description} Instant delivery, secure payment, 24/7 support from CGAPH.`);
        }

        // Update meta keywords
        const metaKeywords = document.getElementById('metaKeywords');
        if (metaKeywords) {
            const keywords = [
                product.name.toLowerCase(),
                'game top up nepal',
                'instant delivery',
                'secure payment',
                'cgaph',
                'nepal'
            ].join(', ');
            metaKeywords.setAttribute('content', keywords);
        }

        // Update Open Graph tags
        const ogTitle = document.getElementById('ogTitle');
        if (ogTitle) {
            ogTitle.setAttribute('content', `${product.name} - Best Price in Nepal | CGAPH`);
        }

        const ogDescription = document.getElementById('ogDescription');
        if (ogDescription) {
            const ogDesc = product.description.length > 200 
                ? product.description.substring(0, 197) + '...'
                : product.description;
            ogDescription.setAttribute('content', `Buy ${product.name} at the best price in Nepal. ${ogDesc} Instant delivery, secure payment, 24/7 support from CGAPH.`);
        }

        const ogImage = document.getElementById('ogImage');
        if (ogImage && product.imageUrl) {
            ogImage.setAttribute('content', product.imageUrl);
        }

        // Update Twitter tags
        const twitterTitle = document.getElementById('twitterTitle');
        if (twitterTitle) {
            twitterTitle.setAttribute('content', `${product.name} - Best Price in Nepal | CGAPH`);
        }

        const twitterDescription = document.getElementById('twitterDescription');
        if (twitterDescription) {
            const twitterDesc = product.description.length > 200 
                ? product.description.substring(0, 197) + '...'
                : product.description;
            twitterDescription.setAttribute('content', `Buy ${product.name} at the best price in Nepal. ${twitterDesc} Instant delivery, secure payment, 24/7 support from CGAPH.`);
        }

        const twitterImage = document.getElementById('twitterImage');
        if (twitterImage && product.imageUrl) {
            twitterImage.setAttribute('content', product.imageUrl);
        }

        // Update product price meta tag
        const productPrice = document.getElementById('productPrice');
        if (productPrice && product.variants && product.variants.length > 0) {
            const lowestPrice = Math.min(...product.variants.map(v => v.price));
            productPrice.setAttribute('content', lowestPrice.toString());
        }

        // Update structured data
        this.updateStructuredData(product);
    }

    updateStructuredData(product) {
        const schemaScript = document.getElementById('productSchema');
        if (!schemaScript) return;

        const lowestPrice = product.variants && product.variants.length > 0 
            ? Math.min(...product.variants.map(v => v.price))
            : 0;

        const structuredData = {
            "@context": "https://schema.org",
            "@type": "Product",
            "name": product.name,
            "description": product.description,
            "image": product.imageUrl || "https://cgaph.com/logo.png",
            "brand": {
                "@type": "Brand",
                "name": "CGAPH"
            },
            "offers": {
                "@type": "Offer",
                "price": lowestPrice.toString(),
                "priceCurrency": "NPR",
                "availability": "https://schema.org/InStock",
                "seller": {
                    "@type": "Organization",
                    "name": "CGAPH"
                }
            }
        };

        if (product.variants && product.variants.length > 0) {
            structuredData.hasVariant = product.variants.map(variant => ({
                "@type": "Product",
                "name": `${product.name} - ${variant.label}`,
                "offers": {
                    "@type": "Offer",
                    "price": variant.price.toString(),
                    "priceCurrency": "NPR",
                    "availability": "https://schema.org/InStock"
                }
            }));
        }

        schemaScript.textContent = JSON.stringify(structuredData, null, 2);
    }

    displayVariants(variants) {
        // Load variants in the direct grid instead of the modal grid
        const directGrid = document.querySelector('.variant-grid-direct');
        if (!directGrid) return;

        // Display variants in the order they were added (no sorting)
        const variantsHTML = variants.map((variant, index) => `
            <div class="variant-card-direct" data-price="${variant.price}" data-variant-index="${index}">
                <div class="variant-label-direct" data-variant-label="${variant.label || 'Option'}">${variant.label || 'Option'}</div>
                <div class="variant-price-direct">Rs ${variant.price}</div>
            </div>
        `).join('');

        directGrid.innerHTML = variantsHTML;

        // Add click event listeners to variant options in direct grid
        const variantCards = directGrid.querySelectorAll('.variant-card-direct');
        variantCards.forEach(card => {
            card.addEventListener('click', () => {
                this.selectVariant(parseInt(card.dataset.variantIndex));
            });
        });

        // Apply marquee to long variant names after a short delay
        setTimeout(() => {
            this.applyMarqueeToVariants();
        }, 100);
    }

    applyMarqueeToVariants() {
        const variantLabels = document.querySelectorAll('.variant-label-direct');
        variantLabels.forEach(label => {
            // Check if text is overflowing
            if (label.scrollWidth > label.offsetWidth) {
                label.classList.add('marquee');
            }
        });
    }

    selectVariant(variantIndex) {
        // Remove active class from all options in direct grid
        document.querySelectorAll('.variant-card-direct').forEach(card => {
            card.classList.remove('selected');
        });

        // Add active class to selected option in direct grid
        const selectedCard = document.querySelector(`[data-variant-index="${variantIndex}"]`);
        if (selectedCard) {
            selectedCard.classList.add('selected');
        }

        // Use the variant index directly since we're not sorting anymore
        this.selectedVariant = this.currentProduct.variants[variantIndex];
        this.updateSelectedOption();
    }

    updateSelectedOption() {
        if (!this.selectedVariant) return;

        const selectedAmount = document.querySelector('.selected-amount');
        const selectedPrice = document.querySelector('.selected-price');

        if (selectedAmount) selectedAmount.textContent = `${this.selectedVariant.label || 'Option'}`;
        if (selectedPrice) selectedPrice.textContent = `Rs ${this.selectedVariant.price}`;
    }

    displayFeatures(features) {
        const featuresList = document.querySelector('.features-list');
        if (!featuresList) return;

        const featuresHTML = features.map(feature => 
            `<li><i class="fas fa-check"></i> ${feature}</li>`
        ).join('');

        featuresList.innerHTML = featuresHTML;
    }

    displayExtraFields(extraFields) {
        const extraWrap = document.getElementById('extraFieldsSection');
        const extraContainer = document.getElementById('extraFieldsContainer');
        
        if (!extraWrap || !extraContainer) {
            return;
        }

        // Show and populate extra fields
        extraWrap.style.display = 'block';
        extraContainer.innerHTML = extraFields.map(field => `
            <div class="form-group extra-field" data-label="${field.label}">
                <label>${field.label}${field.required ? ' *' : ''}</label>
                <input 
                    type="text" 
                    placeholder="${field.placeholder || ''}" 
                    ${field.required ? 'required' : ''} 
                />
            </div>
        `).join('');
        

    }

    validateExtraFields() {
        if (!this.currentProduct.extraFields || this.currentProduct.extraFields.length === 0) {
            return true; // No extra fields to validate
        }

        const requiredFields = document.querySelectorAll('#extraFieldsContainer .extra-field input[required]');
        const allFilled = Array.from(requiredFields).every(input => input.value.trim() !== '');
        
        return allFilled;
    }

    updateTabContent(tabContent) {
        // Update description tab
        if (tabContent.description) {
            const descriptionPanel = document.getElementById('description');
            if (descriptionPanel) {
                descriptionPanel.innerHTML = tabContent.description;
            }
        }

        // Update other tabs as needed
        if (tabContent.reviews) {
            const reviewsPanel = document.getElementById('reviews');
            if (reviewsPanel) {
                reviewsPanel.innerHTML = tabContent.reviews;
            }
        }

        if (tabContent.howTo) {
            const howToPanel = document.getElementById('how-to');
            if (howToPanel) {
                howToPanel.innerHTML = tabContent.howTo;
            }
        }

        if (tabContent.support) {
            const supportPanel = document.getElementById('support');
            if (supportPanel) {
                supportPanel.innerHTML = tabContent.support;
            }
        }
    }

    setupEventListeners() {
        // Add to cart button
        const addToCartBtn = document.querySelector('.btn-add-cart');
        if (addToCartBtn) {
            addToCartBtn.addEventListener('click', () => {
                this.addToCart();
            });
        }

        // Buy now button
        const buyNowBtn = document.querySelector('.btn-buy-now');
        if (buyNowBtn) {
            buyNowBtn.addEventListener('click', () => {
                this.buyNow();
            });
        }

        // No wishlist on product page

        // Tab navigation
        const tabBtns = document.querySelectorAll('.tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.switchTab(btn.dataset.tab);
            });
        });
    }

    addToCart() {
        if (!this.currentProduct || !this.selectedVariant) {
            showToast('Please select a product variant', 'error');
            return;
        }

        // Validate required extra fields
        if (!this.validateExtraFields()) {
            showToast('Please fill in all required fields', 'error');
            return;
        }



        // Collect extra field values from the product page
        const extraFieldsData = [];
        if (this.currentProduct.extraFields && this.currentProduct.extraFields.length > 0) {
            document.querySelectorAll('#extraFieldsContainer .extra-field').forEach(div => {
                const label = div.getAttribute('data-label');
                const input = div.querySelector('input');
                if (label && input) {
                    extraFieldsData.push({
                        label: label,
                        value: input.value.trim()
                    });
                }
            });
        }

        const cartItem = {
            id: this.currentProduct.id,
            productId: this.currentProduct.id, // Add productId for sales tracking
            name: this.currentProduct.name,
            variant: this.selectedVariant,
            image: this.currentProduct.imagePath,
            price: this.selectedVariant.price,
            extraFields: extraFieldsData
        };



        // Use the global cart instance if available
        if (window.cart) {
            window.cart.addItem(cartItem);
        } else {
            // Fallback to localStorage if cart.js is not loaded
            let cart = JSON.parse(localStorage.getItem('cart') || '[]');
            
            // Check if item already exists in cart
            const existingItemIndex = cart.findIndex(item => 
                item.id === cartItem.id && item.variant?.label === cartItem.variant?.label
            );

            if (existingItemIndex !== -1) {
                cart[existingItemIndex].quantity = (cart[existingItemIndex].quantity || 1) + 1;
            } else {
                cartItem.quantity = 1;
                cart.push(cartItem);
            }

            // Save to localStorage
            localStorage.setItem('cart', JSON.stringify(cart));
            
            // Update cart count display
            this.updateCartCountDisplay(cart.length);
        }

        showToast('Added to cart successfully!', 'success');
    }

    buyNow() {
        if (!this.currentProduct || !this.selectedVariant) {
            showToast('Please select a product variant', 'error');
            return;
        }

        // Add to cart first
        this.addToCart();
        
        // Redirect to cart page
        setTimeout(() => {
            window.location.href = 'cart.html';
        }, 1000);
    }

    // wishlist removed

    switchTab(tabName) {
        // Remove active class from all tabs and panels
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));

        // Add active class to selected tab and panel
        const selectedTab = document.querySelector(`[data-tab="${tabName}"]`);
        const selectedPanel = document.getElementById(tabName);

        if (selectedTab) selectedTab.classList.add('active');
        if (selectedPanel) selectedPanel.classList.add('active');
    }

    updateCartCount(count) {
        const cartCountElements = document.querySelectorAll('.cart-count');
        cartCountElements.forEach(element => {
            element.textContent = count;
        });
    }
    
    updateCartCountDisplay(count) {
        const cartCountElements = document.querySelectorAll('.cart-count');
        cartCountElements.forEach(element => {
            element.textContent = count;
        });
    }
    
    initializeCartCount() {
        // Try to get cart count from global cart instance first
        if (window.cart) {
            window.cart.updateCartCount();
        } else {
            // Fallback to localStorage
            const cart = JSON.parse(localStorage.getItem('cart') || '[]');
            const cartCount = cart.reduce((total, item) => total + (item.quantity || 1), 0);
            this.updateCartCountDisplay(cartCount);
        }
    }

    async loadLatestReviews(productId) {
        try {
            const reviewsRef = collection(db, 'products', productId, 'reviews');
            const q = query(reviewsRef, orderBy('createdAt', 'desc'), limit(5));
            const snap = await getDocs(q);

            const reviews = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            this.renderReviews(reviews);
        } catch (err) {
            const list = document.getElementById('reviewsList');
            if (list) list.innerHTML = '<div class="muted">Failed to load reviews.</div>';
        }
    }

    renderReviews(reviews) {
        const list = document.getElementById('reviewsList');
        if (!list) return;

        if (!reviews.length) {
            list.innerHTML = '<div class="muted">No reviews</div>';
            return;
        }

        const html = reviews.map(r => `
            <div class="review-item">
                <div class="review-header">
                    <div class="reviewer-info">
                        <div class="reviewer-avatar"><i class="fas fa-user"></i></div>
                        <div>
                            <h4>${this.escapeHtml(r.userName || r.userEmail || 'Anonymous')}</h4>
                            <div class="stars">${this.starIcons(r.rating || 0)}</div>
                        </div>
                    </div>
                    <span class="review-date">${this.formatDate(r.createdAt)}</span>
                </div>
                <p class="review-text">${this.escapeHtml(r.text || '')}</p>
            </div>
        `).join('');

        list.innerHTML = html;
    }

    renderReviewSummary(data) {
        const avgRatingEl = document.getElementById('avgRating');
        const avgStarsEl = document.getElementById('avgStars');
        const totalEl = document.getElementById('totalReviews');
        const barsEl = document.getElementById('ratingBars');

        const total = data.total || (Array.isArray(data) ? data.length : 0);
        if (total === 0) {
            if (avgRatingEl) avgRatingEl.textContent = '-';
            if (avgStarsEl) avgStarsEl.innerHTML = this.starIcons(0);
            if (totalEl) totalEl.textContent = '0 reviews';
            if (barsEl) barsEl.innerHTML = '';
            return;
        }

        const avg = data.avg != null ? data.avg : 0;
        const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        const arr = data.all || (Array.isArray(data) ? data : []);
        arr.forEach(r => { const k = String(r.rating || 0); if (counts[k] !== undefined) counts[k]++; });

        if (avgRatingEl) avgRatingEl.textContent = String(avg);
        if (avgStarsEl) avgStarsEl.innerHTML = this.starIcons(avg);
        if (totalEl) totalEl.textContent = `${total} review${total !== 1 ? 's' : ''}`;
        if (barsEl) {
            const bars = [5,4,3,2,1].map(stars => {
                const pct = Math.round((counts[stars] / total) * 100) || 0;
                return `
                    <div class="rating-bar">
                        <span>${stars} stars</span>
                        <div class="bar"><div class="fill" style="width:${pct}%"></div></div>
                        <span>${pct}%</span>
                    </div>
                `;
            }).join('');
            barsEl.innerHTML = bars;
        }
    }

    async loadReviewAggregate(productId) {
        try {
            const reviewsRef = collection(db, 'products', productId, 'reviews');
            const snap = await getDocs(query(reviewsRef, orderBy('createdAt', 'desc')));
            const all = snap.docs.map(d => d.data());
            const total = all.length;
            let avg = 0;
            if (total > 0) {
                const sum = all.reduce((acc, r) => acc + (Number(r.rating) || 0), 0);
                avg = Math.round((sum / total) * 10) / 10;
            }
            this.renderReviewSummary({ avg, total, all });
            return { avg, total };
        } catch (e) {
            this.renderReviewSummary({ avg: 0, total: 0, all: [] });
            return { avg: 0, total: 0 };
        }
    }

    setupReviewForm(productId) {
        const writeBtn = document.getElementById('writeReviewBtn');
        const wrap = document.getElementById('reviewFormWrap');
        const cancelBtn = document.getElementById('cancelReviewBtn');
        const form = document.getElementById('reviewForm');

        if (writeBtn && wrap) {
            writeBtn.addEventListener('click', () => {
                wrap.style.display = 'block';
                writeBtn.style.display = 'none';
            });
        }
        if (cancelBtn && wrap && writeBtn) {
            cancelBtn.addEventListener('click', () => {
                wrap.style.display = 'none';
                writeBtn.style.display = 'inline-block';
            });
        }
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const user = auth.currentUser;
                if (!user) {
                    showToast('Please login to write a review.', 'info');
                    window.location.href = 'login.html';
                    return;
                }
                const rating = Number(document.getElementById('reviewRating').value);
                const text = document.getElementById('reviewText').value.trim();
                if (!rating || !text) { showToast('Please add rating and review text', 'error'); return; }
                try {
                    await addDoc(collection(db, 'products', productId, 'reviews'), {
                        uid: user.uid,
                        userName: user.displayName || '',
                        userEmail: user.email || '',
                        rating,
                        text,
                        createdAt: serverTimestamp()
                    });
                    showToast('Review submitted. Thank you!', 'success');
                    // reset UI
                    form.reset();
                    if (wrap && writeBtn) { wrap.style.display = 'none'; writeBtn.style.display = 'inline-block'; }
                    await this.loadLatestReviews(productId);
                        } catch (err) {
            showToast('Failed to submit review', 'error');
        }
            });
        }
    }

    starIcons(rating) {
        const full = Math.floor(rating);
        const half = rating - full >= 0.5 ? 1 : 0;
        const empty = 5 - full - half;
        return `${'<i class="fas fa-star"></i>'.repeat(full)}${half ? '<i class="fas fa-star-half-alt"></i>' : ''}${'<i class="far fa-star"></i>'.repeat(empty)}`;
    }

    formatDate(ts) {
        try {
            const d = ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : new Date());
            return d.toLocaleDateString();
        } catch { return ''; }
    }

    escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}

// Initialize product manager when DOM is loaded
let productManager;
document.addEventListener('DOMContentLoaded', async () => {
    productManager = new ProductManager();
    
    // Check if we're on a product details page
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');
    
    if (productId) {
        await productManager.displayProductDetails(productId);
    }
    
    // Make productManager globally accessible
    window.productManager = productManager;
    
    // Initialize cart count display after a short delay to ensure cart.js is loaded
    setTimeout(() => {
        if (productManager.initializeCartCount) {
            productManager.initializeCartCount();
        }
    }, 100);
});

export { ProductManager };
