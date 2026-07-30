import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth, db } from '../firebase/config';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Mail, LogIn, Chrome, ArrowRight, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion } from 'motion/react';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { PasswordField } from '../components/PasswordField';
import { startOTPSession } from '../services/otpService';
import { OTPVerification } from '../components/OTPVerification';
import { useAuth } from '../context/AuthContext';
import { ChefLoader } from '../components/ChefLoader';

const Login = () => {
  const location = useLocation();
  const [email, setEmail] = useState(() => {
    return (location.state as any)?.email || '';
  });
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isNewUserDetected, setIsNewUserDetected] = useState(false);
  
  // OTP state machine
  const [showOTP, setShowOTP] = useState(false);
  const [tempUser, setTempUser] = useState<any>(null);

  const navigate = useNavigate();
  const { verifySessionOtp } = useAuth();

  const handlePreLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const cleanedEmail = email.trim().toLowerCase();
    const isAdminAccount = cleanedEmail === 'admin@gmail.com' && password === 'admin6';

    try {
      let user;
      try {
        const result = await signInWithEmailAndPassword(auth, cleanedEmail, password);
        user = result.user;
      } catch (err: any) {
        // Handle special admin bootstrapping
        if (isAdminAccount && (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password')) {
          try {
            const result = await createUserWithEmailAndPassword(auth, cleanedEmail, password);
            user = result.user;
            await updateProfile(user, { displayName: 'System Admin' });
          } catch (signupErr: any) {
            throw err;
          }
        } else {
          throw err;
        }
      }

      if (user) {
        const isAdminEmail = cleanedEmail === 'admin@gmail.com' || cleanedEmail === 'example@gmail.com';

        if (isAdminEmail) {
          // Admin bypasses OTP session and directly logs in
          await verifySessionOtp(user.uid);
          
          try {
            // Save primary user records
            await setDoc(doc(db, 'users', user.uid), {
              uid: user.uid,
              email: user.email,
              displayName: user.displayName || 'System Admin',
              role: 'admin',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            }, { merge: true });
            
            // Track email registration
            if (user.email) {
              await setDoc(doc(db, 'registered_emails', user.email.toLowerCase().trim()), {
                exists: true,
                uid: user.uid,
                createdAt: serverTimestamp(),
              }, { merge: true });
            }
            
            toast.success('Admin authorization granted 🔑');
            navigate('/admin');
            return;
          } catch (dbErr) {
            handleFirestoreError(dbErr, OperationType.WRITE, `users/${user.uid}`);
          }
        } else {
          // Save the authenticated user state temporarily and show Email Verification
          setTempUser(user);
          
          // Trigger verification email via EmailJS
          const session = await startOTPSession(cleanedEmail, user.displayName || 'Guest');
          if (session.success) {
            setShowOTP(true);
            setLoading(false);
          } else {
            // If OTP generation fails, sign out and let them retry
            await auth.signOut();
            setLoading(false);
          }
        }
      }
    } catch (error: any) {
      let isNew = error.code === 'auth/user-not-found';
      if (!isNew && error.code === 'auth/invalid-credential') {
        try {
          const regDoc = await getDoc(doc(db, 'registered_emails', cleanedEmail));
          if (!regDoc.exists()) {
            isNew = true;
          }
        } catch (dbErr) {
          console.warn("Could not check registered emails:", dbErr);
        }
      }

      if (isNew) {
        setIsNewUserDetected(true);
        toast.error('Email not registered! "New user means click register button below..."');
      } else {
        toast.error(error.message || 'Login failed. Please check credentials.');
      }
      setLoading(false);
    }
  };

  const handleOTPSuccess = async () => {
    setLoading(true);
    if (!tempUser) {
      toast.error('Session expired. Please log in again.');
      setShowOTP(false);
      setLoading(false);
      return;
    }

    try {
      const user = tempUser;
      const isAdminAccount = user.email === 'admin@gmail.com';

      // 1. Mark session as OTP verified in active sessionStorage reactively
      await verifySessionOtp(user.uid);

      // 2. Sync / create basic collections
      if (isAdminAccount) {
        try {
          await setDoc(doc(db, 'users', user.uid), {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName || 'System Admin',
            role: 'admin',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }, { merge: true });

          // Track email registration
          if (user.email) {
            await setDoc(doc(db, 'registered_emails', user.email.toLowerCase().trim()), {
              exists: true,
              uid: user.uid,
              createdAt: serverTimestamp(),
            }, { merge: true });
          }
          
          toast.success('Admin authorization granted 🔑');
          navigate('/admin');
          return;
        } catch (dbErr) {
          handleFirestoreError(dbErr, OperationType.WRITE, `users/${user.uid}`);
        }
      } else {
        // Ensure standard user profiles collection exists
        try {
          const profRef = doc(db, 'user_profiles', user.uid);
          const profSnap = await getDoc(profRef);
          if (!profSnap.exists()) {
            await setDoc(profRef, {
              uid: user.uid,
              fullName: user.displayName || '',
              displayName: user.displayName || '',
              email: user.email,
              phone: '',
              address: '',
              landmark: '',
              city: '',
              state: '',
              pincode: '',
              photoUrl: '', // Default placeholder avatar
              latitude: null,
              longitude: null,
              updatedAt: serverTimestamp(),
            });
          }
        } catch (profileErr) {
          console.warn("Could not check or seed user profile on login:", profileErr);
        }

        // Track email registration
        try {
          if (user.email) {
            await setDoc(doc(db, 'registered_emails', user.email.toLowerCase().trim()), {
              exists: true,
              uid: user.uid,
              createdAt: serverTimestamp(),
            }, { merge: true });
          }
        } catch (regErr) {
          console.warn("Could not merge registered email record on login:", regErr);
        }
      }

      toast.success('Successfully logged in! Welcome back 🌿');
      navigate('/');
    } catch (err: any) {
      toast.error(err.message || 'Access authorization failed');
    } finally {
      setLoading(false);
    }
  };

  const handleOTPCancel = async () => {
    setShowOTP(false);
    setLoading(false);
    try {
      // Discard current firebase session if they cancelled or failed the OTP screen
      await auth.signOut();
    } catch (e) {
      console.warn("Signout during cancel failed", e);
    }
    setTempUser(null);
    toast.error('Login dynamic verification cancelled.');
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      // Google sign-in is exempt from OTP as requested
      await verifySessionOtp(user.uid);

      // Check if user profile exists
      const docRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        await setDoc(docRef, {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          role: 'user',
          createdAt: serverTimestamp(),
        });
      }

      // Initialize default profile if it doesn't exist
      const profRef = doc(db, 'user_profiles', user.uid);
      const profSnap = await getDoc(profRef);
      if (!profSnap.exists()) {
        await setDoc(profRef, {
          uid: user.uid,
          fullName: user.displayName || '',
          displayName: user.displayName || '',
          email: user.email || '',
          phone: '',
          address: '',
          landmark: '',
          city: '',
          state: '',
          pincode: '',
          photoUrl: '',
          latitude: null,
          longitude: null,
          updatedAt: serverTimestamp(),
        });
      }

      // Track email registration for Google Account login
      if (user.email) {
        await setDoc(doc(db, 'registered_emails', user.email.toLowerCase().trim()), {
          exists: true,
          uid: user.uid,
          createdAt: serverTimestamp(),
        }, { merge: true });
      }
      
      toast.success('Logged in with Google 🌐');
      navigate('/');
    } catch (error: any) {
      setLoading(false);
      toast.error(error.message || 'Google login failed');
    }
  };

  if (loading) {
    return <ChefLoader message={showOTP ? "Verifying your security key and unlocking the kitchen... 🔑👨‍🍳" : "Securing your access to Spice Garden..."} />;
  }

  return (
    <div className="min-h-screen pt-28 md:pt-32 flex items-center justify-center bg-gray-50 px-4 pb-12">
      <div className="max-w-md w-full">
        {!showOTP ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div className="text-center mb-10">
              <div className="w-20 h-20 bg-orange-600 rounded-[2rem] flex items-center justify-center text-white text-3xl font-bold mx-auto mb-6 shadow-xl shadow-orange-200">S</div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2 font-black tracking-tight">Welcome Back</h1>
              <p className="text-gray-500 text-sm">Sign in to your account for a faster spice experience.</p>
            </div>

            <div className="bg-white p-8 md:p-10 rounded-[3rem] shadow-xl border border-gray-100 text-left">
              <form onSubmit={handlePreLogin} className="space-y-5 flex-col flex">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700 ml-1">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="email"
                      required
                      placeholder="name@example.com"
                      className="w-full pl-14 pr-6 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all font-medium text-sm focus:outline-none"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (isNewUserDetected) setIsNewUserDetected(false);
                      }}
                    />
                  </div>
                </div>

                {/* Password field with Visibility Toggle */}
                <PasswordField
                  label="Password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (isNewUserDetected) setIsNewUserDetected(false);
                  }}
                />

                {isNewUserDetected && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-orange-50 border border-orange-200 rounded-2xl text-left"
                  >
                    <p className="text-xs font-bold text-orange-900 flex items-start gap-2">
                      <span className="text-base select-none mt-0.5">🌱</span>
                      <span>
                        New user? Click the{" "}
                        <Link to="/signup" state={{ email }} className="underline font-black text-orange-950">
                          Create account
                        </Link>{" "}
                        button below to register a new account!
                      </span>
                    </p>
                  </motion.div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full py-4 rounded-2xl font-bold text-lg flex items-center justify-center transition-all ${
                    loading
                      ? 'bg-gray-200 text-gray-400'
                      : 'bg-orange-600 text-white hover:bg-orange-700 shadow-xl shadow-orange-100/50'
                  }`}
                >
                  {loading ? 'Validating credentials...' : (
                    <>Sign In <ArrowRight className="ml-2 w-5 h-5" /></>
                  )}
                </button>
              </form>

              <div className="relative my-8">
                <hr className="border-gray-100" />
                <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Or continue with</span>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <button
                  onClick={handleGoogleLogin}
                  className="w-full py-4 rounded-2xl border-2 border-gray-100 font-bold text-gray-700 flex items-center justify-center hover:bg-gray-50 hover:border-gray-200 transition-all cursor-pointer"
                >
                  <Chrome className="w-5 h-5 mr-3 text-red-500" />
                  Sign in with Google
                </button>
              </div>
            </div>

            <p className="mt-8 text-center text-gray-500 text-sm font-medium">
              Don't have an account?{' '}
              <Link to="/signup" className="text-orange-600 font-extrabold hover:underline inline-flex items-center">
                Create account <UserPlus className="ml-1 w-4 h-4" />
              </Link>
            </p>
          </motion.div>
        ) : (
          <OTPVerification
            email={email}
            name={tempUser?.displayName || 'User'}
            purpose="login"
            onSuccess={handleOTPSuccess}
            onCancel={handleOTPCancel}
          />
        )}
      </div>
    </div>
  );
};

export default Login;
