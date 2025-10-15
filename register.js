import { auth, db } from './firebase-config.js';
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, createUserWithEmailAndPassword, updateProfile, sendEmailVerification } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { ensureUserDoc } from './wallet.js';
import { showToast } from './toast.js';
import { authErrorMessage } from './auth-errors.js';

function passwordStrength(pw) {
  let score = 0;
  if (!pw) return 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 4);
}

function updateStrengthUI(score, pwValue) {
  const fill = document.getElementById('strengthFill');
  const text = document.getElementById('strengthText');
  if (!fill) return;
  // Reset classes
  fill.classList.remove('strength-weak', 'strength-fair', 'strength-good', 'strength-strong');
  if (!pwValue) {
    if (text) text.textContent = 'Password strength';
    return;
  }
  let cls = 'strength-weak';
  if (score <= 1) cls = 'strength-weak';
  else if (score === 2) cls = 'strength-fair';
  else if (score === 3) cls = 'strength-good';
  else cls = 'strength-strong';
  fill.classList.add(cls);
  if (text) {
    const labels = ['Very weak', 'Weak', 'Okay', 'Good', 'Strong'];
    // Map our cls to label index
    const labelIndex = cls === 'strength-weak' ? 1 : cls === 'strength-fair' ? 2 : cls === 'strength-good' ? 3 : 4;
    text.textContent = 'Password strength: ' + labels[labelIndex];
  }
}


function wireStrengthMeter() {
  const pwInput = document.getElementById('password');
  if (!pwInput) return;
  pwInput.addEventListener('input', () => {
    updateStrengthUI(passwordStrength(pwInput.value), pwInput.value);
  });
  // Initialize once
  updateStrengthUI(passwordStrength(pwInput.value), pwInput.value);
}

function wireEmailRegistration() {
  const form = document.getElementById('registerForm');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const firstName = document.getElementById('firstName')?.value?.trim() || '';
    const lastName = document.getElementById('lastName')?.value?.trim() || '';
    const email = document.getElementById('email')?.value?.trim() || '';
    const phone = document.getElementById('phone')?.value?.trim() || '';
    const password = document.getElementById('password')?.value || '';
    const confirm = document.getElementById('confirmPassword')?.value || '';

    if (password !== confirm) { showToast('Passwords do not match.', 'error'); return; }

    const btn = form.querySelector('button[type="submit"]');
    const original = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = 'Creating...'; }

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const user = cred.user;
      await updateProfile(user, { displayName: `${firstName} ${lastName}`.trim() });
      try { await sendEmailVerification(user); } catch {}
      await setDoc(doc(db, 'users', user.uid), {
        firstName, lastName, email, phone,
        profitPercentage: 0, // Default to 0, admin will set this later
        role: 'user', // Default role for new users
        balance: 0, // Single field for wallet, profit, and balance
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });
      try { await ensureUserDoc(user); } catch {}
      showToast('Account created. Please verify your email.', 'success');
      window.location.href = 'index.html';
    } catch (err) {
      showToast(authErrorMessage(err, 'register'), 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = original || 'Create Account'; }
    }
  });
}

function wireGoogleSignup() {
  const googleBtn = document.querySelector('.social-btn.google');
  if (!googleBtn) return;
  googleBtn.addEventListener('click', async () => {
    try {
      const provider = new GoogleAuthProvider();
      if (window.location.protocol === 'file:') {
        await signInWithRedirect(auth, provider);
        return;
      }
      const cred = await signInWithPopup(auth, provider);
      const user = cred.user;
      await setDoc(doc(db, 'users', user.uid), {
        firstName: user.displayName || '',
        lastName: '',
        email: user.email || '',
        phone: user.phoneNumber || '',
        profitPercentage: 0, // Default to 0 for Google signup
        role: 'user', // Default role for new users
        balance: 0, // Single field for wallet, profit, and balance
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });
      try { await ensureUserDoc(user); } catch {}
      window.location.href = 'index.html';
    } catch (err) {
      // Fallback to redirect for popup issues or unsupported envs
      try {
        const provider = new GoogleAuthProvider();
        await signInWithRedirect(auth, provider);
      } catch (e) { showToast(authErrorMessage(e, 'register'), 'error'); }
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  wireStrengthMeter();
  wireEmailRegistration();
  wireGoogleSignup();
  // Complete Google redirect sign-in if returning from redirect
  getRedirectResult(auth).then(async (result) => {
    if (result && result.user) {
      const user = result.user;
      await setDoc(doc(db, 'users', user.uid), {
        firstName: user.displayName || '',
        lastName: '',
        email: user.email || '',
        phone: user.phoneNumber || '',
        profitPercentage: 0, // Default to 0 for Google redirect signup
        role: 'user', // Default role for new users
        balance: 0, // Single field for wallet, profit, and balance
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });
      try { await ensureUserDoc(user); } catch {}
      window.location.href = 'index.html';
    }
  }).catch(() => {});
});


