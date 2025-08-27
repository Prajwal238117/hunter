class ScrollAnimations {
    constructor() {
        this.animatedElements = document.querySelectorAll('.animate-on-scroll');
        this.init();
    }

    init() {
        this.setupIntersectionObserver();
        this.addScrollListener();
    }

    setupIntersectionObserver() {
        if ('IntersectionObserver' in window) {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('animated');
                    }
                });
            }, {
                threshold: 0.1,
                rootMargin: '0px 0px -50px 0px'
            });

            this.animatedElements.forEach(element => {
                observer.observe(element);
            });
        } else {
            // Fallback for older browsers
            this.animateOnScroll();
        }
    }

    addScrollListener() {
        // Fallback scroll listener
        window.addEventListener('scroll', () => {
            if (!('IntersectionObserver' in window)) {
                this.animateOnScroll();
            }
        });
    }

    animateOnScroll() {
        this.animatedElements.forEach(element => {
            const elementTop = element.getBoundingClientRect().top;
            const elementVisible = 150;

            if (elementTop < window.innerHeight - elementVisible) {
                element.classList.add('animated');
            }
        });
    }
}

// Initialize scroll animations when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ScrollAnimations();
});

export { ScrollAnimations };
