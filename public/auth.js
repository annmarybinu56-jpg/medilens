/* ========== DEBUG LOGGING ========== */
function debugLog(context, message, data = null) {
    const timestamp = new Date().toLocaleTimeString();
    const style = 'color: #0ea5e9; font-weight: bold;';
    console.log(`%c[${timestamp}] [${context}]`, style, message);
    if (data) console.dir(data);
}

/* ========== TOAST ========== */
function toast(msg, duration = 3000) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), duration);
}

/* ========== FIREBASE AUTH LOGIC ========== */
let isSignUpMode = false;

function toggleAuthMode() {
    isSignUpMode = !isSignUpMode;
    debugLog('Auth', `Switched to ${isSignUpMode ? 'Sign Up' : 'Login'} mode`);

    document.getElementById('authTitle').textContent = isSignUpMode ? 'Create Account' : 'Sign In';
    document.getElementById('authSwitchNote').textContent = isSignUpMode ? 'Already have an account? Login here.' : "Don't have an account? Sign Up instead.";

    const agreeBtn = document.getElementById('agreeBtn');
    if (agreeBtn) agreeBtn.textContent = isSignUpMode ? 'Create Account' : 'Sign In';
}

async function handleFirebaseAuth() {
    debugLog('Auth', 'Auth process initiated');

    if (!window.mlAuth) {
        debugLog('Auth', 'Firebase SDK not found - using demo fallback');
        toast('Firebase not initialized. Demo mode.');
        return;
    }

    const { auth, signInWithEmailAndPassword, createUserWithEmailAndPassword } = window.mlAuth;
    const email = document.getElementById('authEmail').value.trim();
    const pass = document.getElementById('authPass').value;

    // Basic Validation
    if (!email || !email.includes('@')) {
        debugLog('Auth', 'Validation failed: Invalid email');
        toast('⚠️ Please enter a valid email address.');
        return;
    }
    if (pass.length < 8) {
        debugLog('Auth', 'Validation failed: Password too short');
        toast('⚠️ Password must be at least 8 characters.');
        return;
    }

    const agreeBtn = document.getElementById('agreeBtn');
    try {
        debugLog('Auth', `Attempting ${isSignUpMode ? 'registration' : 'login'} for: ${email}`);
        agreeBtn.textContent = 'Processing...';
        agreeBtn.disabled = true;

        let userCredential;
        if (isSignUpMode) {
            userCredential = await createUserWithEmailAndPassword(auth, email, pass);
            debugLog('Auth', 'Registration successful', userCredential.user);
            toast('✅ Account created successfully!');
        } else {
            userCredential = await signInWithEmailAndPassword(auth, email, pass);
            debugLog('Auth', 'Login successful', userCredential.user);
            toast('✅ Welcome back!');
        }

        // Success - redirect to main application
        debugLog('Auth', 'Redirecting to index.html...');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1000);

    } catch (err) {
        debugLog('Auth', 'Authentication failed', err);

        let msg = 'Authentication Error';
        switch (err.code) {
            case 'auth/user-not-found':
                msg = 'Account not found. Please sign up.';
                break;
            case 'auth/wrong-password':
                msg = 'Incorrect password. Try again.';
                break;
            case 'auth/email-already-in-use':
                msg = 'Email already in use. Try logging in.';
                break;
            case 'auth/configuration-not-found':
                msg = '⚠️ Firebase Auth not enabled. Go to Console -> Build -> Auth -> Sign-in Method and enable "Email/Password".';
                break;
            case 'auth/invalid-email':
                msg = 'The email address is badly formatted.';
                break;
            case 'auth/weak-password':
                msg = 'The password is too weak.';
                break;
            case 'auth/network-request-failed':
                msg = 'Network error. Check your connection.';
                break;
            case 'auth/too-many-requests':
                msg = 'Too many attempts. Try again later.';
                break;
            default:
                msg = err.message;
        }

        toast('❌ ' + msg);
        agreeBtn.textContent = isSignUpMode ? 'Create Account' : 'Sign In';
        agreeBtn.disabled = false;
    }
}

function initAuthLogic() {
    if (!window.mlAuth) return;

    debugLog('Auth', 'Initializing Auth Logic...');
    const { auth, onAuthStateChanged } = window.mlAuth;
    onAuthStateChanged(auth, (user) => {
        if (user) {
            debugLog('Auth', 'User already signed in - redirecting to index.html');
            window.location.href = 'index.html';
        }
    });

    const agreeBtn = document.getElementById('agreeBtn');
    if (agreeBtn) {
        // Remove existing to avoid duplicates if called twice
        agreeBtn.removeEventListener('click', handleFirebaseAuth);
        agreeBtn.addEventListener('click', handleFirebaseAuth);
    }
}

// Global hook for the entry button
window.addEventListener('DOMContentLoaded', () => {
    initAuthLogic();
});

// Callback for when Firebase config is loaded asynchronously
window.handleAuthReady = initAuthLogic;

/* ========== EXPORTS ========== */
window.toggleAuthMode = toggleAuthMode;
window.handleFirebaseAuth = handleFirebaseAuth;
