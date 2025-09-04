// Simple and Reliable Marquee Handler for Product Names
class MarqueeHandler {
    constructor() {
        this.processedElements = new WeakSet();
        this.init();
    }

    init() {
        // Start immediately if DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.start());
        } else {
            this.start();
        }
    }

    start() {
        // Apply marquee immediately
        this.applyMarqueeToElements();
        
        // Set up continuous monitoring
        this.setupContinuousMonitoring();
        
        // Also watch for dynamic content
        this.watchForDynamicContent();
    }

    setupContinuousMonitoring() {
        // Check every 2 seconds for new elements
        setInterval(() => {
            this.applyMarqueeToElements();
        }, 2000);
        
        // Also check after a longer delay for slower loading content
        setTimeout(() => this.applyMarqueeToElements(), 5000);
        setTimeout(() => this.applyMarqueeToElements(), 10000);
        setTimeout(() => this.applyMarqueeToElements(), 15000);
    }

    watchForDynamicContent() {
        // Watch for changes in the entire document
        const observer = new MutationObserver((mutations) => {
            let shouldCheck = false;
            
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            // Check if this looks like product content
                            if (node.classList && (
                                node.classList.contains('products-grid') ||
                                node.classList.contains('product-card') ||
                                node.classList.contains('purchase-row')
                            )) {
                                shouldCheck = true;
                            }
                        }
                    });
                }
            });
            
            if (shouldCheck) {
                // Wait a bit for content to render, then check
                setTimeout(() => this.applyMarqueeToElements(), 100);
            }
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    applyMarqueeToElements() {
        // Find all potential product name elements
        const selectors = [
            '.product-name',
            '.product-card.compact .product-name',
            '.product-card h3',
            'h3.product-name',
            '.product-info h3',
            '.cart-item-title',
            '.purchase-row .product-name'
        ];
        
        let allElements = [];
        selectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            allElements = allElements.concat(Array.from(elements));
        });
        
        // Process each element
        allElements.forEach((element, index) => {
            if (!this.processedElements.has(element)) {
                this.processedElements.add(element);
                this.checkAndApplyMarquee(element);
            }
        });
    }

    checkAndApplyMarquee(element) {
        // Make sure element is visible and has content
        if (!element || !element.textContent || element.offsetWidth === 0) {
            return;
        }
        
        // Check if text is overflowing
        const containerWidth = element.offsetWidth;
        const textWidth = element.scrollWidth;
        
        if (textWidth > containerWidth + 5) {
            this.applyMarquee(element);
        }
    }

    applyMarquee(element) {
        // Remove existing marquee classes
        element.classList.remove('marquee', 'marquee-reverse');
        
        // Add marquee class
        element.classList.add('marquee');
        
        // Add title attribute for accessibility
        if (!element.title) {
            element.title = element.textContent;
        }
        
        // Create a wrapper span for the text content if it doesn't exist
        if (!element.querySelector('.marquee-text')) {
            const text = element.textContent;
            element.innerHTML = `<span class="marquee-text">${text}</span>`;
        }
        
        // Force the animation styles directly to ensure they work
        const marqueeText = element.querySelector('.marquee-text');
        if (marqueeText) {
            marqueeText.style.animation = 'marquee 8s linear infinite';
            marqueeText.style.display = 'inline-block';
            marqueeText.style.whiteSpace = 'nowrap';
        }
        
        // Add hover pause functionality (only once)
        if (!element.hasAttribute('data-marquee-events')) {
            element.setAttribute('data-marquee-events', 'true');
            
            element.addEventListener('mouseenter', () => {
                const marqueeText = element.querySelector('.marquee-text');
                if (marqueeText) {
                    marqueeText.style.animationPlayState = 'paused';
                }
            });
            
            element.addEventListener('mouseleave', () => {
                const marqueeText = element.querySelector('.marquee-text');
                if (marqueeText) {
                    marqueeText.style.animationPlayState = 'running';
                }
            });
        }
    }

    // Public method to manually trigger marquee
    refresh() {
        this.processedElements = new WeakSet();
        this.applyMarqueeToElements();
    }

    // Public method to force marquee on specific elements
    forceMarquee(selector) {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
            this.applyMarquee(element);
        });
    }
}

// Initialize marquee handler
const marqueeHandler = new MarqueeHandler();

// Make it available globally
window.MarqueeHandler = MarqueeHandler;
window.marqueeHandler = marqueeHandler;

// Manual trigger function
window.triggerMarquee = () => {
    if (window.marqueeHandler) {
        window.marqueeHandler.refresh();
    }
};

// Force marquee on specific elements
window.forceMarquee = (selector) => {
    if (window.marqueeHandler) {
        window.marqueeHandler.forceMarquee(selector);
    }
};












