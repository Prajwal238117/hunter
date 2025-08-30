// Loading Screen Manager
class LoadingScreen {
    constructor() {
        this.loadingScreen = null;
        this.progressBar = null;
        this.progressText = null;
        this.isLoading = true;
        this.loadedElements = 0;
        this.totalElements = 0;
        this.init();
    }

    init() {
        this.createLoadingScreen();
        this.startLoading();
        this.setupEventListeners();
    }

    createLoadingScreen() {
        // Create loading screen HTML
        const loadingHTML = `
            <div class="loading-screen" id="loadingScreen">
                <img src="logo.png" alt="CGAPH Logo" class="loading-logo">
                <div class="loading-spinner"></div>
                <div class="loading-text" id="loadingText">Loading CGAPH...</div>
                <div class="loading-subtext" id="loadingSubtext">Please wait while we prepare your experience</div>
                <div class="loading-progress">
                    <div class="loading-progress-bar" id="loadingProgressBar"></div>
                </div>
            </div>
        `;

        // Insert loading screen at the beginning of body
        document.body.insertAdjacentHTML('afterbegin', loadingHTML);
        
        this.loadingScreen = document.getElementById('loadingScreen');
        this.progressBar = document.getElementById('loadingProgressBar');
        this.progressText = document.getElementById('loadingText');
        this.subText = document.getElementById('loadingSubtext');
    }

    startLoading() {
        // Simulate loading progress
        this.updateProgress(0, 'Initializing...');
        
        setTimeout(() => {
            this.updateProgress(20, 'Loading assets...');
        }, 500);

        setTimeout(() => {
            this.updateProgress(40, 'Preparing content...');
        }, 1000);

        setTimeout(() => {
            this.updateProgress(60, 'Setting up interface...');
        }, 1500);

        setTimeout(() => {
            this.updateProgress(80, 'Almost ready...');
        }, 2000);

        setTimeout(() => {
            this.updateProgress(100, 'Welcome to CGAPH!');
            this.hideLoadingScreen();
        }, 2500);
    }

    updateProgress(percentage, text) {
        if (this.progressBar) {
            this.progressBar.style.width = `${percentage}%`;
        }
        if (this.progressText) {
            this.progressText.textContent = text;
        }
        
        // Update subtext based on progress
        if (this.subText) {
            if (percentage < 30) {
                this.subText.textContent = 'Please wait while we prepare your experience';
            } else if (percentage < 60) {
                this.subText.textContent = 'Loading your favorite products...';
            } else if (percentage < 90) {
                this.subText.textContent = 'Setting up the perfect shopping experience...';
            } else {
                this.subText.textContent = 'You\'re all set!';
            }
        }
    }

    hideLoadingScreen() {
        if (this.loadingScreen) {
            this.loadingScreen.classList.add('hidden');
            this.isLoading = false;
            
            // Remove loading screen after animation
            setTimeout(() => {
                if (this.loadingScreen && this.loadingScreen.parentNode) {
                    this.loadingScreen.parentNode.removeChild(this.loadingScreen);
                }
            }, 500);
        }
    }

    setupEventListeners() {
        // Hide loading screen when page is fully loaded
        window.addEventListener('load', () => {
            if (this.isLoading) {
                setTimeout(() => {
                    this.hideLoadingScreen();
                }, 500);
            }
        });

        // Hide loading screen if it takes too long (fallback)
        setTimeout(() => {
            if (this.isLoading) {
                this.hideLoadingScreen();
            }
        }, 10000); // 10 second fallback
    }

    // Method to show loading screen again (for page transitions)
    showLoadingScreen() {
        if (this.loadingScreen) {
            this.loadingScreen.classList.remove('hidden');
            this.isLoading = true;
        } else {
            this.createLoadingScreen();
            this.startLoading();
        }
    }
}

// Initialize loading screen when DOM is ready
let loadingScreen;
document.addEventListener('DOMContentLoaded', () => {
    loadingScreen = new LoadingScreen();
});

// Make loading screen globally accessible
window.loadingScreen = loadingScreen;

// Export for module usage
export { LoadingScreen };
