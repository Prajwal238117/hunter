import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { collection, query, where, getDocs, doc, updateDoc, addDoc, serverTimestamp, getDoc } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { showToast } from './toast.js';

// Redeem code function
async function redeemCode(code) {
    try {
        const user = auth.currentUser;
        if (!user) {
            showToast('Please log in to redeem codes', 'error');
            return false;
        }

        // Find the code in database (check both spinCodes and balanceCodes)
        const spinQuery = query(
            collection(db, 'spinCodes'),
            where('code', '==', code.toUpperCase())
        );
        const balanceQuery = query(
            collection(db, 'balanceCodes'),
            where('code', '==', code.toUpperCase())
        );
        
        const [spinSnap, balanceSnap] = await Promise.all([
            getDocs(spinQuery),
            getDocs(balanceQuery)
        ]);
        
        const codeSnap = spinSnap.empty ? balanceSnap : spinSnap;
        const codeCollection = spinSnap.empty ? 'balanceCodes' : 'spinCodes';
        
        if (codeSnap.empty) {
            showResultModal(false, 'Invalid Code', 'This code does not exist or has already been used.');
            return false;
        }

        const codeDoc = codeSnap.docs[0];
        const codeData = codeDoc.data();

        // Check if code is already used
        console.log('Checking code usage status:', {
            code: code,
            isUsed: codeData.isUsed,
            userId: codeData.userId,
            createdBy: codeData.createdBy,
            createdAt: codeData.createdAt?.toDate?.()?.toLocaleString() || 'N/A'
        });
        
        if (codeData.isUsed) {
            showResultModal(false, 'Code Already Used', 'This code has already been redeemed.');
            return false;
        }

        // Check if code belongs to current user (skip for admin-created codes)
        if (codeData.userId !== user.uid && codeData.createdBy !== 'admin') {
            showResultModal(false, 'Invalid Code', 'This code does not belong to you.');
            return false;
        }

        // Check if code is expired
        const now = new Date();
        const expiresAt = codeData.expiresAt?.toDate?.() || new Date(0);
        
        if (now > expiresAt) {
            showResultModal(false, 'Code Expired', 'This code has expired. Codes are valid for 30 days.');
            return false;
        }

        // Handle spin wheel codes differently
        if (codeCollection === 'spinCodes') {
            // For scratch card codes, DON'T mark as used yet - let the scratch card page handle it
            // Just redirect to scratch card without marking the code as used
            
            // Show success modal with scratch card option
            showResultModal(true, 'Scratch Card Code Redeemed!', `You can now scratch the card to win rewards! The maximum possible reward is Rs ${codeData.amount}.`, null, true, code);
            return true;
        } else {
            // For balance codes, give money directly
            // Mark code as used
            await updateDoc(doc(db, codeCollection, codeDoc.id), {
                isUsed: true,
                usedAt: serverTimestamp(),
                usedBy: user.uid
            });

            // Add amount to user's wallet balance
            const userRef = doc(db, 'users', user.uid);
            const userDoc = await getDoc(userRef);
            
            if (userDoc.exists()) {
                const userData = userDoc.data();
                const currentBalance = userData.balance || 0;
                const newBalance = currentBalance + codeData.amount;

                // Update user balance
                await updateDoc(userRef, {
                    balance: newBalance,
                    updatedAt: serverTimestamp()
                });

                // Add wallet transaction
                await addDoc(collection(db, 'walletTransactions'), {
                    userId: user.uid,
                    type: 'balance_reward',
                    amount: codeData.amount,
                    balance: newBalance,
                    description: `Store balance reward redeemed with code ${code}`,
                    code: code,
                    createdAt: serverTimestamp()
                });

                // Show success modal
                showResultModal(true, 'Code Redeemed!', `Successfully added Rs ${codeData.amount} to your wallet!`, codeData.amount);
                
                return true;
            } else {
                showResultModal(false, 'Error', 'User account not found.');
                return false;
            }
        }

    } catch (error) {
        console.error('Error redeeming code:', error);
        showResultModal(false, 'Error', 'An error occurred while redeeming your code. Please try again.');
        return false;
    }
}

// Show result modal
function showResultModal(success, title, message, amount = null, isSpinWheel = false, code = null) {
    const modal = document.getElementById('resultModal');
    const resultIcon = document.getElementById('resultIcon');
    const resultTitle = document.getElementById('resultTitle');
    const resultMessage = document.getElementById('resultMessage');
    const rewardAmount = document.getElementById('rewardAmount');

    if (!modal || !resultIcon || !resultTitle || !resultMessage) return;

    // Set icon
    if (success) {
        if (isSpinWheel) {
            resultIcon.innerHTML = '<i class="fas fa-gift success-icon"></i>';
        } else {
            resultIcon.innerHTML = '<i class="fas fa-check-circle success-icon"></i>';
        }
        resultIcon.className = 'success-icon';
    } else {
        resultIcon.innerHTML = '<i class="fas fa-times-circle error-icon"></i>';
        resultIcon.className = 'error-icon';
    }

    // Set title and message
    resultTitle.textContent = title;
    resultMessage.textContent = message;

    // Show reward amount if successful and not spin wheel
    if (success && amount && !isSpinWheel) {
        rewardAmount.textContent = `Rs ${amount}`;
        rewardAmount.style.display = 'block';
    } else {
        rewardAmount.style.display = 'none';
    }

    // Add scratch card button if applicable
    if (success && isSpinWheel) {
        const closeBtn = modal.querySelector('.close-modal');
        if (closeBtn) {
            closeBtn.innerHTML = '<i class="fas fa-gift"></i> Go to Scratch Card';
            closeBtn.onclick = () => {
                window.location.href = `spin-wheel.html?code=${code}`;
            };
        }
    } else {
        const closeBtn = modal.querySelector('.close-modal');
        if (closeBtn) {
            closeBtn.innerHTML = 'Close';
            closeBtn.onclick = closeResultModal;
        }
    }

    // Show modal
    modal.style.display = 'flex';

    // Add celebration effect for success
    if (success) {
        createConfetti();
    }
}

// Close result modal
function closeResultModal() {
    const modal = document.getElementById('resultModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Create confetti effect
function createConfetti() {
    const colors = ['#27ae60', '#2ecc71', '#f39c12', '#e74c3c', '#3498db'];
    
    for (let i = 0; i < 30; i++) {
        const confetti = document.createElement('div');
        confetti.style.position = 'fixed';
        confetti.style.width = '8px';
        confetti.style.height = '8px';
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.left = Math.random() * 100 + 'vw';
        confetti.style.top = '-10px';
        confetti.style.borderRadius = '50%';
        confetti.style.pointerEvents = 'none';
        confetti.style.zIndex = '9999';
        confetti.style.animation = `confettiFall ${Math.random() * 2 + 1}s linear forwards`;
        
        document.body.appendChild(confetti);
        
        // Remove confetti after animation
        setTimeout(() => {
            if (confetti.parentNode) {
                confetti.parentNode.removeChild(confetti);
            }
        }, 3000);
    }
}

// Add confetti animation CSS
const style = document.createElement('style');
style.textContent = `
    @keyframes confettiFall {
        0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
        }
        100% {
            transform: translateY(100vh) rotate(360deg);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Handle form submission
function handleRedeemForm() {
    const form = document.getElementById('redeemForm');
    const redeemButton = document.getElementById('redeemButton');
    
    if (!form || !redeemButton) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const codeInput = document.getElementById('redeemCode');
        if (!codeInput) return;

        const code = codeInput.value.trim().toUpperCase();
        
        if (code.length !== 16) {
            showToast('Please enter a valid 16-digit code', 'error');
            return;
        }

        // Disable button during processing
        redeemButton.disabled = true;
        redeemButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Redeeming...';

        try {
            const success = await redeemCode(code);
            
            if (success) {
                // Clear form on success
                codeInput.value = '';
            }
        } catch (error) {
            console.error('Error in form submission:', error);
            showToast('An error occurred. Please try again.', 'error');
        } finally {
            // Re-enable button
            redeemButton.disabled = false;
            redeemButton.innerHTML = '<i class="fas fa-gift"></i> Redeem Code';
        }
    });
}

// Auto-format code input
function setupCodeInput() {
    const codeInput = document.getElementById('redeemCode');
    if (!codeInput) return;

    codeInput.addEventListener('input', (e) => {
        let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (value.length > 16) {
            value = value.substring(0, 16);
        }
        e.target.value = value;
    });

    codeInput.addEventListener('paste', (e) => {
        e.preventDefault();
        let pastedText = e.clipboardData.getData('text').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (pastedText.length > 16) {
            pastedText = pastedText.substring(0, 16);
        }
        e.target.value = pastedText;
    });
}

// Initialize redeem page
document.addEventListener('DOMContentLoaded', () => {
    // Check authentication
    onAuthStateChanged(auth, (user) => {
        if (!user) {
            showToast('Please log in to redeem codes', 'error');
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 2000);
            return;
        }
        
        // Setup form and input
        handleRedeemForm();
        setupCodeInput();
    });
});

// Make functions globally available
window.closeResultModal = closeResultModal;
