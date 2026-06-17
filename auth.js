// ============================================================
// FEELSHARE — Authentication Logic (auth.js)
// ============================================================

import { auth, db, googleProvider } from './firebase-config.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, setDoc, getDoc, query, collection, where, getDocs, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ============================================================
// UTILITIES
// ============================================================
function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <span class="toast-msg">${msg}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
  `;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function getPinValue(attr) {
  return Array.from(document.querySelectorAll(`[${attr}]`))
    .map(i => i.value).join('');
}

function hashPin(pin) {
  let hash = 0;
  for (let i = 0; i < pin.length; i++) {
    hash = ((hash << 5) - hash) + pin.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString();
}

// ============================================================
// PAGE DETECTION
// ============================================================
const isSignupPage = !!document.getElementById('signupForm');
const isLoginPage  = !!document.getElementById('loginForm');

// Flag to suppress onAuthStateChanged during active login
let isLoggingIn = false;

// ============================================================
// REDIRECT IF ALREADY LOGGED IN
// ============================================================
onAuthStateChanged(auth, (user) => {
  if (isLoggingIn) return;
  if (user && (isSignupPage || isLoginPage)) {
    if (sessionStorage.getItem('pinVerified') === 'true') {
      window.location.href = 'dashboard.html';
    }
  }
});

// ============================================================
// SIGNUP
// ============================================================
if (isSignupPage) {
  const signupForm    = document.getElementById('signupForm');
  const signupBtn     = document.getElementById('signupBtn');
  const signupBtnText = document.getElementById('signupBtnText');
  const signupSpinner = document.getElementById('signupSpinner');

  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const firstName  = document.getElementById('firstName').value.trim();
    const lastName   = document.getElementById('lastName').value.trim();
    const username   = document.getElementById('username').value.trim().toLowerCase();
    const email      = document.getElementById('email').value.trim();
    const password   = document.getElementById('password').value;
    const pin        = getPinValue('data-pin-index');
    const pinConfirm = getPinValue('data-pin-confirm-index');

    if (!firstName || !lastName || !username || !email || !password) {
      return showToast('Punan ang lahat ng fields.', 'error');
    }
    if (username.length < 3) {
      return showToast('Username ay dapat least 3 characters.', 'error');
    }
    if (!/^[a-z0-9_]+$/.test(username)) {
      return showToast('Username: letters, numbers, at underscore lang.', 'error');
    }
    if (password.length < 6) {
      return showToast('Password ay dapat 6+ characters.', 'error');
    }
    if (pin.length !== 4) {
      return showToast('Kumpletuhin ang 4-digit PIN.', 'error');
    }
    if (pin !== pinConfirm) {
      return showToast('Hindi magkatugma ang PIN. Subukan ulit.', 'error');
    }

    signupBtnText.textContent = 'Creating...';
    signupSpinner.classList.remove('d-none');
    signupBtn.disabled = true;

    try {
      const usernameQuery = query(collection(db, 'users'), where('username', '==', username));
      const usernameSnap  = await getDocs(usernameQuery);
      if (!usernameSnap.empty) {
        showToast('Username na ninakuha na. Pumili ng iba.', 'error');
        throw new Error('username-taken');
      }

      const userCred = await createUserWithEmailAndPassword(auth, email, password);
      const uid = userCred.user.uid;

      await setDoc(doc(db, 'users', uid), {
        uid, firstName, lastName, username, email,
        pin: hashPin(pin),
        profilePicUrl: '', bio: '', phoneNumber: '',
        linkedAccounts: [],
        createdAt: new Date().toISOString(),
        provider: 'email'
      });

      showToast('Account created! Redirecting to login...', 'success');
      await auth.signOut();
      setTimeout(() => { window.location.href = 'login.html'; }, 1800);

    } catch (err) {
      if (err.message !== 'username-taken') {
        let msg = 'Something went wrong. Try again.';
        if (err.code === 'auth/email-already-in-use') msg = 'Email ay ginagamit na.';
        if (err.code === 'auth/invalid-email')        msg = 'Invalid email format.';
        if (err.code === 'auth/weak-password')        msg = 'Password too weak.';
        showToast(msg, 'error');
      }
    } finally {
      signupBtnText.textContent = 'Create Account';
      signupSpinner.classList.add('d-none');
      signupBtn.disabled = false;
    }
  });

  document.getElementById('googleSignupBtn').addEventListener('click', async () => {
    isLoggingIn = true;
    try {
      const result  = await signInWithPopup(auth, googleProvider);
      const user    = result.user;
      const snap    = await getDoc(doc(db, 'users', user.uid));

      if (snap.exists()) {
        // Already has an account — just log them in
        sessionStorage.setItem('pinVerified', 'true');
        window.location.replace('dashboard.html');
      } else {
        // New Google user — create their profile then go to dashboard
        const nameParts = (user.displayName || '').split(' ');
        const firstName = nameParts[0] || 'User';
        const lastName  = nameParts.slice(1).join(' ') || '';
        const username  = user.email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '');

        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          firstName,
          lastName,
          username,
          email: user.email,
          pin: hashPin('0000'), // default PIN, user should change
          profilePicUrl: user.photoURL || '',
          bio: '', phoneNumber: '',
          linkedAccounts: [],
          createdAt: new Date().toISOString(),
          provider: 'google'
        });

        sessionStorage.setItem('pinVerified', 'true');
        window.location.replace('dashboard.html');
      }
    } catch (err) {
      isLoggingIn = false;
      showToast('Google sign-in failed. Try again.', 'error');
    }
  });
}

// ============================================================
// LOGIN
// ============================================================
if (isLoginPage) {
  const loginForm    = document.getElementById('loginForm');
  const loginBtn     = document.getElementById('loginBtn');
  const loginBtnText = document.getElementById('loginBtnText');
  const loginSpinner = document.getElementById('loginSpinner');

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email    = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const pin      = getPinValue('data-login-pin');

    if (!email || !password) return showToast('Punan ang email at password.', 'error');
    if (pin.length !== 4)    return showToast('Ilagay ang iyong 4-digit PIN.', 'error');

    loginBtnText.textContent = 'Signing in...';
    loginSpinner.classList.remove('d-none');
    loginBtn.disabled = true;
    isLoggingIn = true;

    try {
      const userCred = await signInWithEmailAndPassword(auth, email, password);
      const uid      = userCred.user.uid;

      const snap = await getDoc(doc(db, 'users', uid));
      if (!snap.exists()) {
        await auth.signOut();
        throw new Error('account-not-found');
      }

      const userData = snap.data();
      if (userData.pin !== hashPin(pin)) {
        await auth.signOut();
        isLoggingIn = false;
        showToast('Mali ang PIN. Subukan ulit.', 'error');
        throw new Error('wrong-pin');
      }

      sessionStorage.setItem('pinVerified', 'true');
      showToast('Welcome back! 🎉', 'success');
      setTimeout(() => { window.location.replace('dashboard.html'); }, 800);

    } catch (err) {
      isLoggingIn = false;
      if (err.message === 'account-not-found') {
        showToast('Account not found.', 'error');
      } else if (err.message !== 'wrong-pin') {
        let msg = 'Login failed. Check your credentials.';
        if (err.code === 'auth/user-not-found')     msg = 'Walang account sa email na ito.';
        if (err.code === 'auth/wrong-password')     msg = 'Mali ang password.';
        if (err.code === 'auth/invalid-email')      msg = 'Invalid email format.';
        if (err.code === 'auth/invalid-credential') msg = 'Mali ang email o password.';
        if (err.code === 'auth/too-many-requests')  msg = 'Too many attempts. Try later.';
        showToast(msg, 'error');
      }
    } finally {
      loginBtnText.textContent = 'Sign In';
      loginSpinner.classList.add('d-none');
      loginBtn.disabled = false;
    }
  });

  // ============================================================
  // GOOGLE LOGIN
  // The root cause: signInWithPopup resolves, we set pinVerified,
  // then call location.href — but onAuthStateChanged in dashboard.js
  // fires BEFORE the new page loads and sees no pinVerified yet
  // because it's a different page context. Actually the real issue
  // is simpler: we must use location.replace (not href) so there's
  // no back-navigation, and we must set pinVerified BEFORE redirect.
  // ============================================================
  document.getElementById('googleLoginBtn').addEventListener('click', async () => {
    isLoggingIn = true;
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user   = result.user;
      const snap   = await getDoc(doc(db, 'users', user.uid));

      if (!snap.exists()) {
        // Google user with no profile — create one with default PIN
        const nameParts = (user.displayName || '').split(' ');
        const firstName = nameParts[0] || 'User';
        const lastName  = nameParts.slice(1).join(' ') || '';
        const username  = user.email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '');

        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          firstName, lastName, username,
          email: user.email,
          pin: hashPin('0000'),
          profilePicUrl: user.photoURL || '',
          bio: '', phoneNumber: '',
          linkedAccounts: [],
          createdAt: new Date().toISOString(),
          provider: 'google'
        });
      }

      // Set BEFORE redirect — this is what the dashboard auth guard checks
      sessionStorage.setItem('pinVerified', 'true');
      showToast('Signed in with Google! 🎉', 'success');
      setTimeout(() => { window.location.replace('dashboard.html'); }, 800);

    } catch (err) {
      isLoggingIn = false;
      showToast('Google sign-in failed. Try again.', 'error');
    }
  });

  // ============================================================
  // FORGOT PIN
  // ============================================================
  let forgotVerifiedUid = null;

  window.verifyForgotUsername = async function () {
    const username = document.getElementById('forgotUsername').value.trim().toLowerCase();
    if (!username) return showToast('Ilagay ang iyong username.', 'error');

    try {
      const q    = query(collection(db, 'users'), where('username', '==', username));
      const snap = await getDocs(q);
      if (snap.empty) return showToast('Username ay hindi nahanap.', 'error');

      forgotVerifiedUid = snap.docs[0].id;
      document.getElementById('newPinSection').classList.remove('d-none');
      document.getElementById('forgotPinNextBtn').textContent = 'Save New PIN';
      showToast('Username verified! Set your new PIN.', 'success');
      window.forgotPinVerified = true;
    } catch (err) {
      showToast('Error. Try again.', 'error');
    }
  };

  window.saveForgotPin = async function () {
    const newPin     = getPinValue('data-newpin');
    const confirmPin = getPinValue('data-newpinconfirm');

    if (newPin.length !== 4)   return showToast('Complete the 4-digit PIN.', 'error');
    if (newPin !== confirmPin) return showToast("PINs don't match.", 'error');
    if (!forgotVerifiedUid)    return showToast('Verify username first.', 'error');

    try {
      await updateDoc(doc(db, 'users', forgotVerifiedUid), { pin: hashPin(newPin) });
      showToast('PIN updated! You can now log in.', 'success');
      if (window.closeForgotPin) window.closeForgotPin();
    } catch (err) {
      showToast('Failed to update PIN.', 'error');
    }
  };
}