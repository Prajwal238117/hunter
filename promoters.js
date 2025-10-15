import { db } from './firebase-config.js';
import { collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

const promotersCol = collection(db, 'promoters');

// Load and display promoters
async function loadPromoters() {
    const promotersGrid = document.getElementById('promotersGrid');
    if (!promotersGrid) return;

    try {
        // Get all promoters ordered by creation date
        const q = query(promotersCol, orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        
        if (snap.empty) {
            showEmptyState();
            return;
        }

        const promoters = [];
        snap.forEach(doc => {
            promoters.push({
                id: doc.id,
                ...doc.data()
            });
        });

        displayPromoters(promoters);
        
    } catch (error) {
        console.error('Error loading promoters:', error);
        showErrorState();
    }
}

function displayPromoters(promoters) {
    const promotersGrid = document.getElementById('promotersGrid');
    if (!promotersGrid) return;

    const promotersHTML = promoters.map(promoter => {
        const platformIcon = getPlatformIcon(promoter.platform);
        const platformName = getPlatformName(promoter.platform);
        
        return `
            <div class="promoter-card" data-promoter-id="${promoter.id}">
                <div class="promoter-info">
                    <img src="${promoter.profilePicture || 'https://via.placeholder.com/60x60/667eea/ffffff?text=?'}" 
                         alt="${promoter.name}" 
                         class="promoter-avatar"
                         onerror="this.src='https://via.placeholder.com/60x60/667eea/ffffff?text=?'">
                    <div class="promoter-details">
                        <h3>${promoter.name || 'Unknown'}</h3>
                        <div class="promoter-platform">
                            <img src="${platformIcon}" alt="${platformName}" class="platform-icon">
                            <span>${platformName}</span>
                        </div>
                    </div>
                </div>
                
                <div class="promoter-stats">
                    <div class="stat-item">
                        <div class="stat-number">${formatNumber(promoter.subscribers || 0)}</div>
                        <div class="stat-label">Subscribers</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-number">${formatNumber(promoter.videos || 0)}</div>
                        <div class="stat-label">Videos</div>
                    </div>
                </div>
                
                <div class="promoter-actions">
                    <a href="${promoter.url}" target="_blank" class="btn-follow">
                        <i class="fas fa-external-link-alt"></i>
                        Visit Channel
                    </a>
                    <button class="btn-share" onclick="sharePromoter('${promoter.id}', '${promoter.name}', '${promoter.url}')">
                        <i class="fas fa-share"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    promotersGrid.innerHTML = promotersHTML;
}

function getPlatformIcon(platform) {
    switch (platform?.toLowerCase()) {
        case 'youtube':
            return 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/youtube.svg';
        case 'tiktok':
            return 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/tiktok.svg';
        case 'instagram':
            return 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/instagram.svg';
        case 'facebook':
            return 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/facebook.svg';
        default:
            return 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/globe.svg';
    }
}

function getPlatformName(platform) {
    switch (platform?.toLowerCase()) {
        case 'youtube':
            return 'YouTube';
        case 'tiktok':
            return 'TikTok';
        case 'instagram':
            return 'Instagram';
        case 'facebook':
            return 'Facebook';
        default:
            return 'Social Media';
    }
}

function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
}

function showEmptyState() {
    const promotersGrid = document.getElementById('promotersGrid');
    if (!promotersGrid) return;

    promotersGrid.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-users"></i>
            <h3>No Promoters Yet</h3>
            <p>We're working on bringing amazing content creators to our platform. Check back soon!</p>
        </div>
    `;
}

function showErrorState() {
    const promotersGrid = document.getElementById('promotersGrid');
    if (!promotersGrid) return;

    promotersGrid.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-exclamation-triangle"></i>
            <h3>Error Loading Promoters</h3>
            <p>There was an error loading the promoters. Please try again later.</p>
        </div>
    `;
}

function sharePromoter(promoterId, promoterName, promoterUrl) {
    if (navigator.share) {
        navigator.share({
            title: `Check out ${promoterName} on CGAPH`,
            text: `Amazing content creator promoting CGAPH's game top-ups!`,
            url: promoterUrl
        }).catch((error) => {
            // Handle share errors gracefully
            if (error.name === 'InvalidStateError') {
                // Another share is in progress, try clipboard fallback
                copyToClipboard(promoterUrl);
            } else {
                console.log('Share cancelled or failed:', error);
                copyToClipboard(promoterUrl);
            }
        });
    } else {
        // Fallback: copy to clipboard
        copyToClipboard(promoterUrl);
    }
}

function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            showToast('Link copied to clipboard!', 'success');
        }).catch(() => {
            // Fallback for older browsers
            fallbackCopyToClipboard(text);
        });
    } else {
        // Fallback for older browsers
        fallbackCopyToClipboard(text);
    }
}

function fallbackCopyToClipboard(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        document.execCommand('copy');
        showToast('Link copied to clipboard!', 'success');
    } catch (err) {
        showToast('Unable to copy link', 'error');
    }
    
    document.body.removeChild(textArea);
}

function showToast(message, type = 'info') {
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    // Style the toast
    Object.assign(toast.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        padding: '1rem 1.5rem',
        borderRadius: '8px',
        color: 'white',
        fontWeight: '500',
        zIndex: '10000',
        transform: 'translateX(100%)',
        transition: 'transform 0.3s ease',
        maxWidth: '300px',
        wordWrap: 'break-word'
    });

    // Set background color based on type
    const colors = {
        success: '#48bb78',
        error: '#f56565',
        warning: '#ed8936',
        info: '#4299e1'
    };
    toast.style.background = colors[type] || colors.info;

    // Add to page
    document.body.appendChild(toast);

    // Animate in
    setTimeout(() => {
        toast.style.transform = 'translateX(0)';
    }, 100);

    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    loadPromoters();
});

// Make functions globally available
window.sharePromoter = sharePromoter;

