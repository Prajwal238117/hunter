import { showToast } from './toast.js';
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { getWalletBalance } from './wallet.js';

// Cart functionality
class Cart {
    constructor() {
        this.items = this.loadCart();
        this.appliedCoupon = null;
        this.init();
    }

    // Make coupon clearing function globally accessible
    static clearCouponDataGlobal() {
        localStorage.removeItem('appliedCoupon');
    }

    loadCart() {
        const cart = localStorage.getItem('cart');
        return cart ? JSON.parse(cart) : [];
    }

    saveCart() {
        localStorage.setItem('cart', JSON.stringify(this.items));
        this.updateCartCount();
    }

    addItem(item) {
        const existingItem = this.items.find(cartItem => cartItem.id === item.id);
        
        if (existingItem) {
            existingItem.quantity += 1;
        } else {
            this.items.push({
                ...item,
                quantity: 1
            });
        }
        
        this.saveCart();
        this.renderCart();
        showToast('Item added to cart', 'success');
    }

    removeItem(itemId) {
        this.items = this.items.filter(item => item.id !== itemId);
        
        // Clear coupon if cart is empty or if minimum order requirement not met
        if (this.items.length === 0) {
            this.appliedCoupon = null;
            localStorage.removeItem('appliedCoupon');
            this.clearCouponTimer(); // Clear the auto-clear timer
        } else if (this.appliedCoupon) {
            const subtotal = this.getTotal();
            if (subtotal < this.appliedCoupon.minAmount) {
                this.appliedCoupon = null;
                localStorage.removeItem('appliedCoupon');
                this.clearCouponTimer(); // Clear the auto-clear timer
                showToast('Coupon removed - minimum order amount not met', 'info');
            }
        }
        
        this.saveCart();
        this.renderCart();
        showToast('Item removed from cart', 'info');
    }

    updateQuantity(itemId, newQuantity) {
        const item = this.items.find(item => item.id === itemId);
        if (item) {
            if (newQuantity <= 0) {
                this.removeItem(itemId);
            } else {
                item.quantity = newQuantity;
                
                // Check if coupon is still valid after quantity change
                if (this.appliedCoupon) {
                    const subtotal = this.getTotal();
                    if (subtotal < this.appliedCoupon.minAmount) {
                        this.appliedCoupon = null;
                        localStorage.removeItem('appliedCoupon');
                        this.clearCouponTimer(); // Clear the auto-clear timer
                        showToast('Coupon removed - minimum order amount not met', 'info');
                    }
                }
                
                this.saveCart();
                this.renderCart();
            }
        }
    }

    getTotal() {
        return this.items.reduce((total, item) => {
            return total + (item.price * item.quantity);
        }, 0);
    }

    getTax() {
        return 0;
    }

    getGrandTotal() {
        return this.getTotal();
    }

    updateCartCount() {
        const cartCount = this.items.reduce((total, item) => total + item.quantity, 0);
        const cartCountElements = document.querySelectorAll('.cart-count');
        
        cartCountElements.forEach(element => {
            element.textContent = cartCount;
        });
        
        // Also update any cart count elements that might be in the navigation
        const navCartCounts = document.querySelectorAll('nav .cart-count');
        navCartCounts.forEach(element => {
            element.textContent = cartCount;
        });
    }

    renderCart() {
        const cartItems = document.getElementById('cartItems');
        const cartCount = document.getElementById('cart-count');
        const emptyCart = document.getElementById('emptyCart');
        const cartContent = document.querySelector('.cart-content');
        const subtotal = document.getElementById('subtotal');
        const tax = document.getElementById('tax');
        const total = document.getElementById('total');
        const checkoutBtn = document.getElementById('checkoutBtn');

        if (this.items.length === 0) {
            // Show empty cart
            if (cartContent) cartContent.style.display = 'none';
            if (emptyCart) emptyCart.style.display = 'block';
            if (cartCount) cartCount.textContent = '0 items in your cart';
            if (checkoutBtn) checkoutBtn.disabled = true;
            return;
        }

        // Show cart items
        if (cartContent) cartContent.style.display = 'grid';
        if (emptyCart) emptyCart.style.display = 'none';

        // Add refresh button for product data
        const cartHeader = document.querySelector('.cart-header');
        if (cartHeader && !document.getElementById('refreshProductsBtn')) {
            const refreshBtn = document.createElement('button');
            refreshBtn.id = 'refreshProductsBtn';
            refreshBtn.className = 'refresh-products-btn';
            refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh Products';
            refreshBtn.onclick = () => this.refreshProductData();
            cartHeader.appendChild(refreshBtn);
        }

        // Render cart items
        if (cartItems) {
            cartItems.innerHTML = this.items.map(item => `
                <div class="cart-item" data-id="${item.id}">
                    <div class="cart-item-image">
                        ${item.image ? `<img src="${item.image}" alt="${item.name}">` : `<i class=\"fas fa-gamepad\"></i>`}
                    </div>
                    <div class="cart-item-details">
                        <div class="cart-item-title">${item.name}</div>
                        <div class="cart-item-description">${item.variant?.label || ''}</div>
                        <div class="cart-item-price">Rs ${item.price.toFixed(2)}</div>
                    </div>
                    <div class="cart-item-quantity">
                        <button class="quantity-btn" onclick="cart.updateQuantity('${item.id}', ${item.quantity - 1})" ${item.quantity <= 1 ? 'disabled' : ''}>
                            <i class="fas fa-minus"></i>
                        </button>
                        <input type="number" class="quantity-input" value="${item.quantity}" min="1" onchange="cart.updateQuantity('${item.id}', parseInt(this.value))">
                        <button class="quantity-btn" onclick="cart.updateQuantity('${item.id}', ${item.quantity + 1})">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>
                    <div class="cart-item-total">
                        Rs ${(item.price * item.quantity).toFixed(2)}
                    </div>
                    <button class="remove-btn" onclick="cart.removeItem('${item.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `).join('');
        }

        // Update summary
        const subtotalValue = this.getTotal();
        const taxValue = this.getTax();
        const discountValue = this.getDiscountAmount();
        const grandTotal = this.getGrandTotal();

        if (subtotal) subtotal.textContent = `Rs ${subtotalValue.toFixed(2)}`;
        if (tax) tax.textContent = `Rs ${taxValue.toFixed(2)}`;
        
        // Show/hide discount row
        const discountRow = document.getElementById('discountRow');
        const discountAmount = document.getElementById('discountAmount');
        if (discountRow && discountAmount) {
            if (discountValue > 0) {
                discountRow.style.display = 'flex';
                discountAmount.textContent = `-Rs ${discountValue.toFixed(2)}`;
            } else {
                discountRow.style.display = 'none';
            }
        }
        
        // Show/hide applied coupon info
        const appliedCouponInfo = document.getElementById('appliedCouponInfo');
        const couponCodeDisplay = document.getElementById('couponCodeDisplay');
        if (appliedCouponInfo && couponCodeDisplay) {
            if (this.appliedCoupon) {
                appliedCouponInfo.style.display = 'block';
                couponCodeDisplay.textContent = `${this.appliedCoupon.code} - ${this.appliedCoupon.type === 'percentage' ? this.appliedCoupon.value + '%' : 'Rs ' + this.appliedCoupon.value} off`;
            } else {
                appliedCouponInfo.style.display = 'none';
            }
        }
        
        if (total) total.textContent = `Rs ${grandTotal.toFixed(2)}`;
        if (cartCount) cartCount.textContent = `${this.items.length} item${this.items.length !== 1 ? 's' : ''} in your cart`;

        // Validate checkout availability
        this.validateCheckout();

        this.updateCartCount();
    }

    clearCart() {
        this.items = [];
        this.appliedCoupon = null;
        localStorage.removeItem('appliedCoupon');
        this.saveCart();
        this.renderCart();
        showToast('Cart cleared', 'info');
    }





    validateCheckout() {
        const checkoutBtn = document.getElementById('checkoutBtn');
        if (!checkoutBtn) return;

        if (this.items.length === 0) {
            checkoutBtn.disabled = true;
            return;
        }

        // Enable checkout button
        checkoutBtn.disabled = false;
            checkoutBtn.innerHTML = '<i class="fas fa-credit-card"></i> Proceed to Checkout';
    }



    checkout() {
        if (this.items.length === 0) {
            showToast('Your cart is empty', 'error');
            return;
        }

        // Clean up any old data before storing new data
        localStorage.removeItem('checkoutData');
        localStorage.removeItem('tempCouponData');

        // Redirect to payment page with cart data
        const cartData = {
            items: this.items,
            subtotal: this.getTotal(),
            tax: this.getTax(),
            total: this.getGrandTotal(),
            appliedCoupon: this.appliedCoupon
        };

        localStorage.setItem('checkoutData', JSON.stringify(cartData));
        
        // Store coupon data temporarily for payment page
        // We'll clear it after the order is completed
        if (this.appliedCoupon) {
            localStorage.setItem('tempCouponData', JSON.stringify(this.appliedCoupon));
        }
        

        window.location.href = 'payment.html';
    }

    init() {
        this.renderCart();
        this.setupEventListeners();
        this.setupHeaderNavigation();
        
        // Clear coupon data if user leaves without proceeding
        this.setupPageUnloadHandler();
        
        // Clear coupon data if user navigates back from payment page
        this.checkIfReturningFromPayment();
    }

    setupPageUnloadHandler() {
        // Clear coupon data when user leaves the page without proceeding
        window.addEventListener('beforeunload', () => {
            if (this.appliedCoupon) {
                // Only clear if user hasn't proceeded to payment
                // This prevents clearing if they're going to payment page
                if (!window.location.href.includes('payment.html')) {
                    this.clearCouponTimer();
                }
            }
        });

        // Also clear coupon data when user navigates away (for single-page navigation)
        window.addEventListener('pagehide', () => {
            if (this.appliedCoupon) {
                // Clear coupon data when leaving cart page
                this.clearCouponData();
            }
        });
    }

    setupEventListeners() {
        // Checkout button
        const checkoutBtn = document.getElementById('checkoutBtn');
        if (checkoutBtn) {
            checkoutBtn.addEventListener('click', () => this.checkout());
        }

        // Coupon functionality
        const applyCouponBtn = document.getElementById('applyCouponBtn');
        const couponInput = document.getElementById('couponCode');
        const removeCouponBtn = document.getElementById('removeCouponBtn');
        
        if (applyCouponBtn && couponInput) {
            applyCouponBtn.addEventListener('click', () => this.handleCouponApply());
            
            // Allow Enter key to apply coupon
            couponInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.handleCouponApply();
                }
            });
        }
        
        if (removeCouponBtn) {
            removeCouponBtn.addEventListener('click', () => this.removeCoupon());
        }
    }

    setupHeaderNavigation() {
        const navMenu = document.querySelector('.nav-menu');
        const legacyAuth = document.querySelector('.nav-auth');
        if (legacyAuth) legacyAuth.remove();
        if (!navMenu) return;

        // Setup logo click functionality
        this.setupLogoClick();

        // Base menu items
        navMenu.innerHTML = `
            <li><a href="index.html" class="nav-link">Home</a></li>
            <li><a href="all-products.html" class="nav-link">Products</a></li>
            <li><a href="index.html#latest-purchases" class="nav-link">Recent</a></li>
            <li><a href="features.html" class="nav-link">Features</a></li>
        `;

        // Auth-aware links
        const authLi = document.createElement('li');
        authLi.className = 'nav-auth-links';
        navMenu.appendChild(authLi);

        // Listen for auth state changes
        onAuthStateChanged(auth, async (user) => {
            if (!user) {
                // User not signed in
                authLi.innerHTML = `<a href="login.html" class="nav-link">Login</a> / <a href="register.html" class="nav-link">Sign Up</a>`;
            } else {
                // User signed in
                let walletStr = '';
                try {
                    const bal = await getWalletBalance(user.uid);
                    walletStr = ` <span class="nav-wallet" style="margin-left:8px;color:#a5b4fc;">Rs ${bal.toFixed(2)}</span>`;
                } catch {}
                authLi.innerHTML = `<a href="profile.html" class="nav-link">My Profile</a>${walletStr}`;
            }
        });

        // Setup hamburger menu functionality
        this.setupHamburgerMenu();
    }

    setupLogoClick() {
        const logoElements = document.querySelectorAll('.nav-brand, .nav-brand img, .nav-brand i, .nav-brand span');
        logoElements.forEach(element => {
            element.style.cursor = 'pointer';
            element.addEventListener('click', () => {
                window.location.href = 'index.html';
            });
        });
    }

    setupHamburgerMenu() {
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('.nav-menu');
    
    if (hamburger && navMenu) {
        hamburger.addEventListener('click', () => {
            hamburger.classList.toggle('active');
            navMenu.classList.toggle('active');
        });

        // Close menu when clicking on a link
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                hamburger.classList.remove('active');
                navMenu.classList.remove('active');
            });
        });

            // Close menu when clicking outside
            document.addEventListener('click', (e) => {
                if (!hamburger.contains(e.target) && !navMenu.contains(e.target)) {
                    hamburger.classList.remove('active');
                    navMenu.classList.remove('active');
                }
            });
        }
    }

    // Coupon functionality
    async applyCoupon(couponCode) {
        try {
            // Get coupon from Firebase
            const couponRef = doc(db, 'coupons', couponCode);
            const couponDoc = await getDoc(couponRef);
            
            if (!couponDoc.exists()) {
                return { success: false, message: 'Invalid coupon code' };
            }
            
            const coupon = couponDoc.data();
            
            // Check if coupon is expired
            if (coupon.expiryDate && new Date() > coupon.expiryDate.toDate()) {
                return { success: false, message: 'Coupon has expired' };
            }
            
            // Check if coupon usage limit reached
            if (coupon.usedCount >= coupon.usageLimit) {
                return { success: false, message: 'Coupon usage limit reached' };
            }
            
            // Check minimum order amount
            const subtotal = this.getTotal();
            if (subtotal < coupon.minAmount) {
                return { success: false, message: `Minimum order amount: Rs ${coupon.minAmount}` };
            }
            
            // Apply coupon
            this.appliedCoupon = coupon;
            
            // Store coupon in localStorage for payment page
            localStorage.setItem('appliedCoupon', JSON.stringify(coupon));
            
            // Set up auto-clear timer for coupon
            this.setupCouponAutoClear();
            
            return { success: true, message: 'Coupon applied successfully!' };
            
        } catch (error) {
            return { success: false, message: 'Error applying coupon' };
        }
    }

    async handleCouponApply() {
        const couponInput = document.getElementById('couponCode');
        const couponMessage = document.getElementById('couponMessage');
        const applyBtn = document.getElementById('applyCouponBtn');
        
        if (!couponInput || !couponMessage || !applyBtn) return;
        
        const couponCode = couponInput.value.trim().toUpperCase();
        if (!couponCode) {
            this.showCouponMessage('Please enter a coupon code', 'error');
            return;
        }
        
        // Disable button and show loading
        applyBtn.disabled = true;
        applyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Applying...';
        
        try {
            const result = await this.applyCoupon(couponCode);
            
            if (result.success) {
                this.showCouponMessage(result.message, 'success');
                this.renderCart(); // Re-render to show discount
            } else {
                this.showCouponMessage(result.message, 'error');
            }
        } catch (error) {
            this.showCouponMessage('Error applying coupon', 'error');
        } finally {
            // Re-enable button
            applyBtn.disabled = false;
            applyBtn.innerHTML = '<i class="fas fa-tag"></i> Apply';
        }
    }

    showCouponMessage(message, type) {
        const couponMessage = document.getElementById('couponMessage');
        if (couponMessage) {
            couponMessage.textContent = message;
            couponMessage.className = `coupon-message ${type}`;
        }
    }

    removeCoupon() {
        this.appliedCoupon = null;
        localStorage.removeItem('appliedCoupon');
        this.clearCouponTimer(); // Clear the auto-clear timer
        this.renderCart(); // Re-render to update display
    }

    // Auto-clear coupon after inactivity (5 minutes)
    setupCouponAutoClear() {
        if (this.appliedCoupon) {
            // Clear any existing timer
            if (this.couponTimer) {
                clearTimeout(this.couponTimer);
            }
            
            // Set new timer to clear coupon after 5 minutes
            this.couponTimer = setTimeout(() => {
                if (this.appliedCoupon) {
                    this.appliedCoupon = null;
                    localStorage.removeItem('appliedCoupon');
                    this.renderCart();
                    showToast('Coupon expired due to inactivity', 'info');
                }
            }, 5 * 60 * 1000); // 5 minutes
        }
    }

    // Clear coupon timer when coupon is removed
    clearCouponTimer() {
        if (this.couponTimer) {
            clearTimeout(this.couponTimer);
            this.couponTimer = null;
        }
    }

    // Clear coupon data completely (called when order is completed)
    clearCouponData() {
        this.appliedCoupon = null;
        localStorage.removeItem('appliedCoupon');
        this.clearCouponTimer();
        this.renderCart();
    }

    // Make this function globally accessible for payment page
    static clearCouponDataGlobal() {
        localStorage.removeItem('appliedCoupon');
    }

    getDiscountAmount() {
        if (!this.appliedCoupon) return 0;
        
        const subtotal = this.getTotal();
        if (this.appliedCoupon.type === 'percentage') {
            return (subtotal * this.appliedCoupon.value) / 100;
        } else {
            return Math.min(this.appliedCoupon.value, subtotal);
        }
    }

    getGrandTotal() {
        const subtotal = this.getTotal();
        const tax = this.getTax();
        const discount = this.getDiscountAmount();
        return Math.max(0, subtotal + tax - discount);
    }

    checkIfReturningFromPayment() {
        // Check if user is returning from payment page
        const referrer = document.referrer;
        const currentUrl = window.location.href;
        

        
        // Only clear if we're actually returning from payment.html
        // This prevents clearing when going TO payment page
        // Also check that referrer is not empty (prevents clearing on initial page load)
        if (referrer && referrer.includes('payment.html') && referrer !== currentUrl) {

            
            // Clear all coupon data
            this.clearCouponData();
            
            // Clear all payment-related localStorage data
            localStorage.removeItem('tempCouponData');
            localStorage.removeItem('checkoutData');
            
            // Also clear any other payment-related data that might exist
            localStorage.removeItem('paymentData');
            localStorage.removeItem('orderData');
            

        } else {

        }
    }

    // Debug function to show current coupon state
    debugCouponState() {
        // Debug function removed - no console logging
    }

    // Refresh product data from database to get updated images and prices
    async refreshProductData() {
        try {
            // Get fresh product data for all cart items
            const updatedItems = [];
            
            for (const cartItem of this.items) {
                try {
                    // Get fresh product data from Firebase
                    const productRef = doc(db, 'products', cartItem.id);
                    const productDoc = await getDoc(productRef);
                    
                    if (productDoc.exists()) {
                        const freshProduct = productDoc.data();
                        
                        // Update cart item with fresh data
                        const updatedItem = {
                            ...cartItem,
                            name: freshProduct.name || cartItem.name,
                            image: freshProduct.image || cartItem.image,
                            price: freshProduct.price || cartItem.price,
                            description: freshProduct.description || cartItem.description
                        };
                        
                        updatedItems.push(updatedItem);
                    } else {
                        // Product no longer exists, keep old data
                        updatedItems.push(cartItem);
                    }
                } catch (error) {
                    // If error fetching product, keep old data
                    updatedItems.push(cartItem);
                }
            }
            
            // Update cart with fresh data
            this.items = updatedItems;
            this.saveCart();
            this.renderCart();
            
        } catch (error) {
            // If error refreshing, keep current cart as is
        }
    }
}

// Initialize cart when DOM is loaded
let cart;
document.addEventListener('DOMContentLoaded', () => {
    cart = new Cart();
    
    // Make cart globally accessible for onclick handlers
    window.cart = cart;
    
    // Update cart count immediately after initialization
    cart.updateCartCount();
    
    // Update cart count when page becomes visible (handles navigation back to page)
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            cart.updateCartCount();
            // Also check if user is returning from payment page
            cart.checkIfReturningFromPayment();
            // Refresh product data to get updated images and prices
            cart.refreshProductData();
        }
    });

    // Also check when page is shown (more reliable for navigation back)
    window.addEventListener('pageshow', (event) => {
        if (event.persisted) {
            // Page was loaded from back-forward cache

            cart.checkIfReturningFromPayment();
        }
    });
    

});

// Export for use in other modules
export { Cart };

// Global function to clear coupon data (can be called from payment page)
window.clearCouponData = () => {
    localStorage.removeItem('appliedCoupon');
    if (window.cart && window.cart.appliedCoupon) {
        window.cart.appliedCoupon = null;
        window.cart.clearCouponTimer();
    }
};

// Global function to debug coupon state (can be called from console)
window.debugCouponState = () => {
    if (window.cart && typeof window.cart.debugCouponState === 'function') {
        window.cart.debugCouponState();
    } else {
        // Debug function not available
    }
};
