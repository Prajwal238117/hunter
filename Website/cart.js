import { showToast } from './toast.js';
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

// Cart functionality
class Cart {
    constructor() {
        this.items = this.loadCart();
        this.init();
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
            this.hideExtraFields();
            return;
        }

        // Show cart items
        if (cartContent) cartContent.style.display = 'grid';
        if (emptyCart) emptyCart.style.display = 'none';

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
        const grandTotal = this.getGrandTotal();

        if (subtotal) subtotal.textContent = `Rs ${subtotalValue.toFixed(2)}`;
        if (tax) tax.textContent = `Rs ${taxValue.toFixed(2)}`;
        if (total) total.textContent = `Rs ${grandTotal.toFixed(2)}`;
        if (cartCount) cartCount.textContent = `${this.items.length} item${this.items.length !== 1 ? 's' : ''} in your cart`;

        // Render extra fields and validate checkout availability
        this.renderExtraFields();
        this.validateCheckout();

        this.updateCartCount();
    }

    clearCart() {
        this.items = [];
        this.saveCart();
        this.renderCart();
        showToast('Cart cleared', 'info');
    }

    renderExtraFields() {
        const extraWrap = document.getElementById('extraFieldsSection');
        const extraContainer = document.getElementById('extraFieldsContainer');
        
        console.log('renderExtraFields called'); // Debug log
        console.log('extraWrap element:', extraWrap); // Debug log
        console.log('extraContainer element:', extraContainer); // Debug log
        
        if (!extraWrap || !extraContainer) {
            console.log('Missing extraFieldsSection or extraFieldsContainer elements!'); // Debug log
            return;
        }

        // Collect unique extra fields from all cart items
        const extraFields = [];
        console.log('Cart items for extra fields:', this.items); // Debug log
        
        this.items.forEach((item, index) => {
            console.log(`Item ${index} (${item.name}) full item data:`, item); // Debug log
            console.log(`Item ${index} (${item.name}) extra fields:`, item.extraFields); // Debug log
            if (item.extraFields && Array.isArray(item.extraFields)) {
                item.extraFields.forEach(field => {
                    const id = (field.label || '').trim().toLowerCase();
                    if (!id) return;
                    if (!extraFields.find(f => f.id === id)) {
                        extraFields.push({
                            id,
                            label: field.label,
                            placeholder: field.placeholder || '',
                            required: !!field.required
                        });
                    }
                });
            }
        });

        console.log('Collected extra fields:', extraFields); // Debug log

        if (extraFields.length === 0) {
            extraWrap.style.display = 'none';
            return;
        }

        // Show and populate extra fields
        console.log('Showing extra fields section'); // Debug log
        extraWrap.style.display = 'block';
        extraContainer.innerHTML = extraFields.map(field => `
            <div class="form-group extra-field" data-label="${field.label}">
                <label>${field.label}${field.required ? ' *' : ''}</label>
                <input 
                    type="text" 
                    placeholder="${field.placeholder}" 
                    ${field.required ? 'required' : ''} 
                    onchange="cart.validateCheckout()"
                    oninput="cart.validateCheckout()"
                />
            </div>
        `).join('');
        
        console.log('Extra fields HTML set:', extraContainer.innerHTML); // Debug log
    }

    hideExtraFields() {
        const extraWrap = document.getElementById('extraFieldsSection');
        if (extraWrap) extraWrap.style.display = 'none';
    }

    validateCheckout() {
        const checkoutBtn = document.getElementById('checkoutBtn');
        if (!checkoutBtn) return;

        if (this.items.length === 0) {
            checkoutBtn.disabled = true;
            return;
        }

        // Check if all required extra fields are filled
        const requiredFields = document.querySelectorAll('#extraFieldsContainer .extra-field input[required]');
        const allFilled = Array.from(requiredFields).every(input => input.value.trim() !== '');

        checkoutBtn.disabled = !allFilled;
        
        if (!allFilled && requiredFields.length > 0) {
            checkoutBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Complete Required Fields';
        } else {
            checkoutBtn.innerHTML = '<i class="fas fa-credit-card"></i> Proceed to Checkout';
        }
    }

    getExtraFieldsData() {
        const extraFieldsData = [];
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
        return extraFieldsData;
    }

    checkout() {
        if (this.items.length === 0) {
            showToast('Your cart is empty', 'error');
            return;
        }

        // Validate required extra fields
        const requiredFields = document.querySelectorAll('#extraFieldsContainer .extra-field input[required]');
        const missingFields = Array.from(requiredFields).filter(input => input.value.trim() === '');
        
        if (missingFields.length > 0) {
            showToast('Please fill in all required fields before proceeding to checkout', 'error');
            // Focus on the first missing field
            missingFields[0].focus();
            return;
        }

        // Save extra fields data to cart items
        const extraFieldsData = this.getExtraFieldsData();
        this.items.forEach(item => {
            item.extraFieldsData = extraFieldsData;
        });
        this.saveCart();

        // Redirect to payment page with cart data
        const cartData = {
            items: this.items,
            subtotal: this.getTotal(),
            tax: this.getTax(),
            total: this.getGrandTotal(),
            extraFieldsData: extraFieldsData
        };

        localStorage.setItem('checkoutData', JSON.stringify(cartData));
        window.location.href = 'payment.html';
    }

    init() {
        this.renderCart();
        this.setupEventListeners();
        this.setupHeaderNavigation();
        this.setupFooterInfo();
    }

    setupEventListeners() {
        // Checkout button
        const checkoutBtn = document.getElementById('checkoutBtn');
        if (checkoutBtn) {
            checkoutBtn.addEventListener('click', () => this.checkout());
        }
    }

    setupHeaderNavigation() {
        const navMenu = document.querySelector('.nav-menu');
        const legacyAuth = document.querySelector('.nav-auth');
        if (legacyAuth) legacyAuth.remove();
        if (!navMenu) return;

        // Base menu items
        navMenu.innerHTML = `
            <li><a href="index.html" class="nav-link">Home</a></li>
            <li><a href="all-products.html" class="nav-link">Products</a></li>
            <li><a href="index.html#latest-purchases" class="nav-link">Recent</a></li>
            <li><a href="index.html#features" class="nav-link">Features</a></li>
        `;

        // Auth-aware links
        const authLi = document.createElement('li');
        authLi.className = 'nav-auth-links';
        authLi.innerHTML = `<a href="login.html" class="nav-link">Login</a> / <a href="register.html" class="nav-link">Sign Up</a>`;
        navMenu.appendChild(authLi);

        onAuthStateChanged(auth, (user) => {
            if (!user) {
                authLi.innerHTML = `<a href="login.html" class="nav-link">Login</a> / <a href="register.html" class="nav-link">Sign Up</a>`;
            } else {
                authLi.innerHTML = `<a href="profile.html" class="nav-link">My Profile</a>`;
            }
        });
    }

    setupFooterInfo() {
        const footer = document.querySelector('.footer');
        if (!footer) return;

        // Complete footer structure
        footer.innerHTML = `
            <div class="footer-content">
                <div class="footer-section">
                    <h3>CGAPH</h3>
                    <p>Your trusted source for digital gaming and entertainment content.</p>
                    <div class="social-links">
                        <a href="https://www.facebook.com/profile.php?id=61579288196935" target="_blank" rel="noopener" aria-label="Facebook"><i class="fab fa-facebook"></i></a>
                        <a href="#" aria-label="Twitter"><i class="fab fa-twitter"></i></a>
                        <a href="#" aria-label="Instagram"><i class="fab fa-instagram"></i></a>
                        <a href="#" aria-label="Discord"><i class="fab fa-discord"></i></a>
                    </div>
                </div>
                <div class="footer-section">
                    <h4>Quick Links</h4>
                    <ul>
                        <li><a href="terms.html">Terms of Service</a></li>
                        <li><a href="privacy.html">Privacy Policy</a></li>
                        <li><a href="refund.html">Refund Policy</a></li>
                    </ul>
                </div>
                <div class="footer-section">
                    <h4>Company</h4>
                    <ul>
                        <li><a href="about.html">About Us</a></li>
                        <li><a href="contact.html">Contact</a></li>
                    </ul>
                </div>
                <div class="footer-section">
                    <h4>Contact Us</h4>
                    <p><i class="fas fa-map-marker-alt"></i> Butwal-4, Hatbazar, Nepal</p>
                    <p><i class="fas fa-phone"></i> +977 9768281599</p>
                    <p><i class="fas fa-envelope"></i> cgaph.np@gmail.com</p>
                </div>
            </div>
            <div class="footer-bottom">
                <p>&copy; 2024 CGAPH. All rights reserved.</p>
            </div>
        `;
    }
}

// Initialize cart when DOM is loaded
let cart;
document.addEventListener('DOMContentLoaded', () => {
    cart = new Cart();
    
    // Make cart globally accessible for onclick handlers
    window.cart = cart;
    
    // Initialize hamburger menu
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
    }
});

// Export for use in other modules
export { Cart };
