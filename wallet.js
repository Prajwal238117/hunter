import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { doc, getDoc, runTransaction, serverTimestamp, setDoc, collection, addDoc } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

export async function getCurrentUser() {
  return new Promise((resolve) => {
    if (auth.currentUser) return resolve(auth.currentUser);
    onAuthStateChanged(auth, (u) => resolve(u || null));
  });
}

export async function getWalletBalance(userId) {
  if (!userId) return 0;
  const ref = doc(db, 'users', userId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return 0;
  const data = snap.data();
  const bal = Number(data.balance || 0);
  return Number.isFinite(bal) ? bal : 0;
}

export async function creditWallet(userId, amount, meta = {}) {
  if (!userId) throw new Error('Missing userId');
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error('Invalid amount');

  const userRef = doc(db, 'users', userId);
  const txCol = collection(db, 'walletTransactions');

  await runTransaction(db, async (transaction) => {
    const userSnap = await transaction.get(userRef);
    const current = userSnap.exists() ? Number(userSnap.data().balance || 0) : 0;
    const next = current + amt;
    transaction.set(userRef, { balance: next, updatedAt: serverTimestamp() }, { merge: true });
  });

  await addDoc(txCol, {
    userId,
    type: 'credit',
    amount: amt,
    meta,
    createdAt: serverTimestamp()
  });
}

export async function spendFromWallet(userId, amount, meta = {}) {
  if (!userId) throw new Error('Missing userId');
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error('Invalid amount');

  const userRef = doc(db, 'users', userId);
  const txCol = collection(db, 'walletTransactions');

  await runTransaction(db, async (transaction) => {
    const userSnap = await transaction.get(userRef);
    const current = userSnap.exists() ? Number(userSnap.data().balance || 0) : 0;
    if (current < amt) throw new Error('INSUFFICIENT_FUNDS');
    const next = current - amt;
    transaction.set(userRef, { balance: next, updatedAt: serverTimestamp() }, { merge: true });
  });

  await addDoc(txCol, {
    userId,
    type: 'debit',
    amount: amt,
    meta,
    createdAt: serverTimestamp()
  });
}

export async function ensureUserDoc(user) {
  if (!user) return;
  const userRef = doc(db, 'users', user.uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    await setDoc(userRef, {
      email: user.email || '',
      displayName: user.displayName || '',
      profitPercentage: 0, // Default to 0 for new users
      balance: 0, // Single field for wallet, profit, and balance
      role: 'user',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
  }
}


