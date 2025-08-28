class CategoryModal {
    constructor() {
        this.categoryModal = document.getElementById('categoryModal');
        this.categoriesBtn = document.getElementById('categoriesBtn');
        this.closeCategoryModal = document.getElementById('closeCategoryModal');
        this.modalCategoryCards = document.querySelectorAll('.modal-category-card');
        
        // Debug logging
        console.log('CategoryModal initialized');
        console.log('categoryModal:', this.categoryModal);
        console.log('categoriesBtn:', this.categoriesBtn);
        console.log('closeCategoryModal:', this.closeCategoryModal);
        console.log('modalCategoryCards:', this.modalCategoryCards);
        
        this.init();
    }

    init() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Handle category button click - redirect to categories page
        if (this.categoriesBtn) {
            console.log('Setting up click listener for categories button');
            this.categoriesBtn.addEventListener('click', (e) => {
                console.log('Categories button clicked!');
                e.preventDefault();
                window.location.href = 'categories.html';
            });
        } else {
            console.error('Categories button not found!');
        }

        // Close category modal
        if (this.closeCategoryModal) {
            this.closeCategoryModal.addEventListener('click', () => {
                this.closeModal();
            });
        }

        // Close modal when clicking outside
        if (this.categoryModal) {
            this.categoryModal.addEventListener('click', (e) => {
                if (e.target === this.categoryModal) {
                    this.closeModal();
                }
            });
        }

        // Handle category card clicks
        this.modalCategoryCards.forEach(card => {
            card.addEventListener('click', () => {
                const category = card.getAttribute('data-category');
                this.selectCategory(category);
            });
        });

        // Close modal with Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.categoryModal?.classList.contains('active')) {
                this.closeModal();
            }
        });
    }

    openCategoryModal() {
        console.log('openCategoryModal called');
        if (this.categoryModal) {
            console.log('Adding active class to modal');
            this.categoryModal.classList.add('active');
            document.body.style.overflow = 'hidden'; // Prevent background scrolling
        } else {
            console.error('Category modal element not found!');
        }
    }

    closeModal() {
        if (this.categoryModal) {
            this.categoryModal.classList.remove('active');
            document.body.style.overflow = ''; // Restore scrolling
        }
    }

    selectCategory(category) {
        // Redirect to the selected category
        window.location.href = `categories.html?category=${category}`;
    }
}

// Initialize category modal when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new CategoryModal();
});

export { CategoryModal };
