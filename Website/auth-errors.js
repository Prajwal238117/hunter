// Map Firebase Auth error codes to friendly messages
export function authErrorMessage(error, context = 'auth') {
  const code = error?.code || '';
  switch (code) {
    case 'auth/email-already-in-use':
      return 'That email is already registered. Try signing in instead.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Please choose a stronger password (at least 8 characters, with letters and numbers).';
    case 'auth/operation-not-allowed':
      return 'This sign-in method is not available right now.';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    case 'auth/user-not-found':
      return 'No account found with that email.';
    case 'auth/wrong-password':
      return 'Incorrect password. Please try again.';
    case 'auth/invalid-credential':
      return 'Invalid credentials. Please try again.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please try again later.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    case 'auth/popup-closed-by-user':
      return 'Sign-in was canceled.';
    case 'auth/popup-blocked':
      return 'Popup was blocked by your browser. Disable the blocker or try redirect sign-in.';
    default:
      if (context === 'register') return 'Registration failed. Please try again.';
      if (context === 'login') return 'Login failed. Please try again.';
      if (context === 'reset') return 'Could not send reset email. Please try again.';
      return 'Something went wrong. Please try again.';
  }
}


