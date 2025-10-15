import { auth } from './firebase-config.js';
import { showToast } from './toast.js';
import { authErrorMessage } from './auth-errors.js';
import { GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";

function wireEmailPasswordLogin() {
  const form = document.getElementById('loginForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email')?.value || '';
    const password = document.getElementById('password')?.value || '';

    const button = form.querySelector('button[type="submit"]');
    const originalText = button?.textContent;
    if (button) { button.disabled = true; button.textContent = 'Signing in...'; }
    try {
      await signInWithEmailAndPassword(auth, email, password);
      showToast('Signed in successfully', 'success');
      window.location.href = 'index.html';
    } catch (err) {
      showToast(authErrorMessage(err, 'login'), 'error');
    } finally {
      if (button) { button.disabled = false; button.textContent = originalText || 'Sign In'; }
    }
  });
}

function wireGoogleLogin() {
  const googleBtn = document.querySelector('.social-btn.google');
  if (!googleBtn) return;

  googleBtn.addEventListener('click', async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      showToast('Signed in with Google', 'success');
      window.location.href = 'index.html';
    } catch (err) {
      showToast(authErrorMessage(err, 'login'), 'error');
    }
  });
}

function wirePasswordReset() {
  const link = document.querySelector('.forgot-password');
  if (!link) return;
  link.addEventListener('click', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email')?.value || '';
    if (!email) { showToast('Enter your email first.', 'info'); return; }
    try {
      await sendPasswordResetEmail(auth, email);
      showToast('Password reset email sent.', 'success');
    } catch (err) {
      showToast(authErrorMessage(err, 'reset'), 'error');
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  wireEmailPasswordLogin();
  wireGoogleLogin();
  wirePasswordReset();
});


