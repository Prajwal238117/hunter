import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { collection, addDoc, doc, getDoc, updateDoc, serverTimestamp, query, where, getDocs } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { showToast } from './toast.js';

// Scratch card rewards with probabilities
const REWARDS = [
    { amount: 1, probability: 80, color: '#ff6b6b' },
    { amount: 5, probability: 15.69, color: '#4ecdc4' },
    { amount: 50, probability: 4.3, color: '#45b7d1' },
    { amount: 1000, probability: 0.01, color: '#feca57' }
];

// Check if user has already spun (prevent multiple spins)
function hasAlreadySpun() {
    const urlParams = new URLSearchParams(window.location.search);
    const spinCode = urlParams.get('code');
    const paymentId = urlParams.get('paymentId');
    
    // Create unique key for this spin session
    const spinKey = spinCode ? `spin_${spinCode}` : `spin_${paymentId}`;
    
    return sessionStorage.getItem(spinKey) === 'true';
}

// Mark spin as completed
function markSpinAsCompleted() {
    const urlParams = new URLSearchParams(window.location.search);
    const spinCode = urlParams.get('code');
    const paymentId = urlParams.get('paymentId');
    
    const spinKey = spinCode ? `spin_${spinCode}` : `spin_${paymentId}`;
    sessionStorage.setItem(spinKey, 'true');
}

// Prevent back button navigation after spin
function preventBackNavigation() {
    // Replace current history entry to prevent back button
    window.history.replaceState(null, null, window.location.href);
    
    // Add beforeunload event to warn user
    window.addEventListener('beforeunload', function(e) {
        e.preventDefault();
        e.returnValue = 'You have already spun the wheel. Going back will not allow you to spin again.';
        return e.returnValue;
    });
}

// Generate 16-digit alphanumeric code
function generateCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 16; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Determine reward based on probability
function getRandomReward() {
    const random = Math.random() * 100;
    let cumulative = 0;
    
    for (const reward of REWARDS) {
        cumulative += reward.probability;
        if (random <= cumulative) {
            return reward;
        }
    }
    
    // Fallback to first reward
    return REWARDS[0];
}

// Get the section that the wheel stops on based on final rotation
function getStoppedSection(finalRotation) {
    // Normalize rotation to 0-360 range
    const normalizedRotation = finalRotation % 360;
    
    // Calculate which section the pointer is pointing to
    // Since the wheel rotates, we need to find the inverse
    const pointerAngle = (360 - normalizedRotation) % 360;
    
    // Determine which section (0-4) the pointer is in
    const section = Math.floor(pointerAngle / 72);
    
    console.log(`Final rotation: ${finalRotation}, normalized: ${normalizedRotation}, pointer angle: ${pointerAngle}, section: ${section}`);
    
    return section;
}

// Verify the wheel stops on the correct amount
function verifyWheelStop(finalRotation, expectedReward) {
    const stoppedSection = getStoppedSection(finalRotation);
    
    // Map sections to amounts
    const sectionAmounts = [1, 5, 50, 1000, 1]; // Rs 1 appears twice
    
    const actualAmount = sectionAmounts[stoppedSection];
    const expectedAmount = expectedReward.amount;
    
    console.log(`Wheel stopped on section ${stoppedSection} (Rs ${actualAmount}), expected Rs ${expectedAmount}`);
    
    return actualAmount === expectedAmount;
}

// Determine reward based on wheel stop position
function getRewardFromWheelPosition(finalRotation) {
    const stoppedSection = getStoppedSection(finalRotation);
    
    // Map sections to amounts (matching the HTML wheel sections)
    const sectionAmounts = [1, 5, 50, 1000, 1]; // Rs 1 appears twice
    
    const amount = sectionAmounts[stoppedSection];
    
    // Find the reward object that matches this amount
    const reward = REWARDS.find(r => r.amount === amount);
    
    return reward || REWARDS[0]; // Fallback to first reward
}

// Calculate wheel rotation angle (probability-based approach)
function calculateRotation() {
    // Map wheel sections to rewards with probabilities
    const sectionRewards = [
        { section: 0, amount: 1, probability: 37.5 },   // Rs 1 (half of 75%)
        { section: 1, amount: 5, probability: 20 },     // Rs 5
        { section: 2, amount: 50, probability: 4.99 },  // Rs 50
        { section: 3, amount: 1000, probability: 0.1 },  // Rs 1000
        { section: 4, amount: 1, probability: 37.5 }     // Rs 1 (half of 75%)
    ];
    
    // Select section based on probability
    const random = Math.random() * 100;
    let cumulative = 0;
    let targetSection = 0;
    
    for (const sectionReward of sectionRewards) {
        cumulative += sectionReward.probability;
        if (random <= cumulative) {
            targetSection = sectionReward.section;
            break;
        }
    }
    
    // Calculate the exact angle where the pointer should land
    const sectionAngle = targetSection * 72; // Each section is 72 degrees
    const sectionCenter = sectionAngle + 36; // Center of the section (36° offset)
    
    // Calculate how much to rotate to bring the section center to the pointer
    const targetRotation = 360 - sectionCenter;
    
    // Add full rotations for visual effect
    const fullRotations = 5 + Math.random() * 3; // 5-8 full rotations
    
    // Final rotation: full rotations + target rotation
    const finalRotation = fullRotations * 360 + targetRotation;
    
    return { rotation: finalRotation, targetSection };
}

// Scratch the card
async function scratchCard() {
    const scratchButton = document.getElementById('scratchButton');
    const scratchSurface = document.getElementById('scratchSurface');
    const prizeReveal = document.getElementById('prizeReveal');
    const revealedAmount = document.getElementById('revealedAmount');
    
    if (!scratchButton || !scratchSurface || !prizeReveal || !revealedAmount) return;
    
    // Check if user has already scratched
    if (hasAlreadySpun()) {
        showToast('You have already scratched the card!', 'error');
        return;
    }
    
    // Disable button during scratch
    scratchButton.disabled = true;
    scratchButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Scratching...';
    
    // Get random reward based on probabilities
    const reward = getRandomReward();
    
    // Show the reward
    revealedAmount.textContent = `Rs ${reward.amount}`;
    
    // Animate scratch effect
    scratchSurface.classList.add('scratched');
    prizeReveal.style.display = 'flex';
    
    // Wait for animation to complete
    setTimeout(async () => {
        // Generate redemption code
        const code = generateCode();
        
        // Save spin result to database
        try {
            const user = auth.currentUser;
            if (!user) {
                showToast('Please log in to spin the wheel', 'error');
                return;
            }
            
            // Check if this is from an admin-generated code
            const urlParams = new URLSearchParams(window.location.search);
            const adminCode = urlParams.get('code');
            
            if (adminCode) {
                // This is from an admin-generated code, mark it as used
                const codeQuery = query(
                    collection(db, 'spinCodes'),
                    where('code', '==', adminCode.toUpperCase())
                );
                
                const codeSnap = await getDocs(codeQuery);
                
                if (!codeSnap.empty) {
                    const codeDoc = codeSnap.docs[0];
                    await updateDoc(doc(db, 'spinCodes', codeDoc.id), {
                        isUsed: true,
                        usedAt: serverTimestamp(),
                        usedBy: user.uid
                    });
                }
            } else {
                // Regular spin from purchase, create new code
                await addDoc(collection(db, 'spinCodes'), {
                    userId: user.uid,
                    code: code,
                    amount: reward.amount,
                    isUsed: false,
                    createdAt: serverTimestamp(),
                    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
                });
            }
            
            // Add reward to user's wallet balance
            const userRef = doc(db, 'users', user.uid);
            const userDoc = await getDoc(userRef);
            
            if (userDoc.exists()) {
                const userData = userDoc.data();
                const currentBalance = userData.balance || 0;
                const newBalance = currentBalance + reward.amount;

                // Update user balance
                await updateDoc(userRef, {
                    balance: newBalance,
                    updatedAt: serverTimestamp()
                });

                // Add wallet transaction
                await addDoc(collection(db, 'walletTransactions'), {
                    userId: user.uid,
                    type: 'spin_reward',
                    amount: reward.amount,
                    balance: newBalance,
                    description: `Spin wheel reward: ${reward.name}`,
                    createdAt: serverTimestamp()
                });
            }
            
            // Mark scratch as completed
            markSpinAsCompleted();
            
            // Prevent back navigation
            preventBackNavigation();
            
            // Show result modal
            showResultModal(reward, code);
            
            // Disable scratch button after successful scratch
            if (scratchButton) {
                scratchButton.disabled = true;
                scratchButton.innerHTML = '<i class="fas fa-check"></i> Already Scratched';
                scratchButton.style.backgroundColor = '#6b7280';
                scratchButton.style.cursor = 'not-allowed';
            }
            
            // Redirect to order success after 5 seconds (only for regular spins)
            if (!adminCode) {
                setTimeout(() => {
                    const urlParams = new URLSearchParams(window.location.search);
                    const paymentId = urlParams.get('paymentId');
                    const total = urlParams.get('total');
                    if (paymentId) {
                        window.location.href = `order-success.html?orderId=${paymentId}&total=${total}&method=wallet`;
                    }
                }, 5000);
            } else {
                // For admin codes, redirect to home after 5 seconds
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 5000);
            }
            
        } catch (error) {
            console.error('Error saving spin result:', error);
            showToast('Error saving spin result', 'error');
        } finally {
            // Re-enable button
            spinButton.disabled = false;
            spinButton.innerHTML = '<i class="fas fa-play"></i> SPIN THE WHEEL!';
        }
    }, 3000);
}

// Show result modal
function showResultModal(reward, code) {
    const modal = document.getElementById('resultModal');
    const prizeAmount = document.getElementById('prizeAmount');
    const codeDisplay = document.getElementById('codeDisplay');
    
    if (!modal || !prizeAmount || !codeDisplay) return;
    
    prizeAmount.textContent = `Rs ${reward.amount}`;
    codeDisplay.textContent = `Amount has been added to your wallet balance!`;
    
    modal.style.display = 'flex';
    
    // Add celebration effect
    createConfetti();
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
    const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57'];
    
    for (let i = 0; i < 50; i++) {
        const confetti = document.createElement('div');
        confetti.style.position = 'fixed';
        confetti.style.width = '10px';
        confetti.style.height = '10px';
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.left = Math.random() * 100 + 'vw';
        confetti.style.top = '-10px';
        confetti.style.borderRadius = '50%';
        confetti.style.pointerEvents = 'none';
        confetti.style.zIndex = '9999';
        confetti.style.animation = `confettiFall ${Math.random() * 3 + 2}s linear forwards`;
        
        document.body.appendChild(confetti);
        
        // Remove confetti after animation
        setTimeout(() => {
            if (confetti.parentNode) {
                confetti.parentNode.removeChild(confetti);
            }
        }, 5000);
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
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Check if user is eligible to spin
async function checkSpinEligibility() {
    try {
        const user = auth.currentUser;
        if (!user) {
            showToast('Please log in to access the spin wheel', 'error');
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 2000);
            return;
        }
        
        // Check if user has a valid spin code from URL
        const urlParams = new URLSearchParams(window.location.search);
        const spinCode = urlParams.get('code');
        
        if (spinCode) {
            // User has a spin code, validate it
            const codeQuery = query(
                collection(db, 'spinCodes'),
                where('code', '==', spinCode.toUpperCase())
            );
            
            const codeSnap = await getDocs(codeQuery);
            
            if (codeSnap.empty) {
                showToast('Invalid spin code!', 'error');
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 3000);
                return;
            }
            
            const codeData = codeSnap.docs[0].data();
            
            // Check if code is used
            if (codeData.isUsed) {
                showToast('This spin code has already been used!', 'error');
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 3000);
                return;
            }
            
            // Check if code is expired
            const now = new Date();
            const expiresAt = codeData.expiresAt?.toDate?.() || new Date(0);
            
            if (now > expiresAt) {
                showToast('This spin code has expired!', 'error');
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 3000);
                return;
            }
            
            // Code is valid, allow spinning
            return;
        }
        
        // No spin code, check if user has made a recent wallet purchase
        const paymentsQuery = query(
            collection(db, 'payments'),
            where('email', '==', user.email),
            where('paymentStatus', '==', 'approved')
        );
        
        const paymentsSnap = await getDocs(paymentsQuery);
        
        if (paymentsSnap.empty) {
            showToast('You need to make a purchase to spin the wheel!', 'info');
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 3000);
            return;
        }
        
        // Check if user has already spun today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const spinQuery = query(
            collection(db, 'spinCodes'),
            where('userId', '==', user.uid),
            where('createdAt', '>=', today)
        );
        
        const spinSnap = await getDocs(spinQuery);
        
        if (!spinSnap.empty) {
            showToast('You have already spun today! Come back tomorrow.', 'info');
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 3000);
            return;
        }
        
    } catch (error) {
        console.error('Error checking spin eligibility:', error);
        showToast('Error checking eligibility', 'error');
    }
}

// Initialize scratch card
document.addEventListener('DOMContentLoaded', () => {
    // Check if user has already scratched
    if (hasAlreadySpun()) {
        const scratchButton = document.getElementById('scratchButton');
        const scratchSurface = document.getElementById('scratchSurface');
        const prizeReveal = document.getElementById('prizeReveal');
        
        if (scratchButton) {
            scratchButton.disabled = true;
            scratchButton.innerHTML = '<i class="fas fa-check"></i> Already Scratched';
            scratchButton.style.backgroundColor = '#6b7280';
            scratchButton.style.cursor = 'not-allowed';
        }
        
        if (scratchSurface && prizeReveal) {
            scratchSurface.classList.add('scratched');
            prizeReveal.style.display = 'flex';
        }
        
        // Prevent back navigation
        preventBackNavigation();
        
        showToast('You have already scratched the card!', 'info');
        return;
    }
    
    // Check authentication
    onAuthStateChanged(auth, (user) => {
        if (user) {
            checkSpinEligibility();
            
            // Update message based on code type
            const urlParams = new URLSearchParams(window.location.search);
            const spinCode = urlParams.get('code');
            const spinMessage = document.getElementById('spinMessage');
            
            if (spinCode && spinMessage) {
                spinMessage.textContent = 'You have a valid spin code! Spin the wheel to win your reward!';
            }
        } else {
            showToast('Please log in to access the spin wheel', 'error');
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 2000);
        }
    });
});

// Make functions globally available
window.scratchCard = scratchCard;
window.closeResultModal = closeResultModal;
