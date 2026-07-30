import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth, db } from '../firebase/config';
import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { Mail, User, UserPlus, ArrowRight, LogIn, Phone } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion } from 'motion/react';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { PasswordField } from '../components/PasswordField';
import { validatePhoneNumber, sanitizePhoneInput } from '../utils/validation';
import { startOTPSession } from '../services/otpService';
import { OTPVerification } from '../components/OTPVerification';
import { ChefLoader } from '../components/ChefLoader';

const Signup = () => {
  const location = useLocation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState(() => {
    return (location.state as any)?.email || '';
  });
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  
  // OTP state machine
  const [showOTP, setShowOTP] = useState(false);

  const navigate = useNavigate();

  const handlePreSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error('Please enter your full name');
      return;
    }
    if (!email.trim()) {
      toast.error('Please enter a valid email');
      return;
    }
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters long');
      return;
    }

    // 1. Phone number validation
    if (!validatePhoneNumber(phone)) {
      toast.error('Invalid phone number! Only standard 10-digit Indian mobile numbers are allowed (starting with 6, 7, 8, or 9). No alphabets or landmarks.');
      return;
    }

    setLoading(true);
    try {
      const cleanedEmail = email.trim().toLowerCase();

      // Check if email already registered in system first
      const regRef = doc(db, 'registered_emails', cleanedEmail);
      const regSnap = await getDoc(regRef);
      if (regSnap.exists()) {
        toast.error('This email is already registered! Redirecting you to login...');
        setLoading(false);
        setTimeout(() => {
          navigate('/login', { state: { email: cleanedEmail } });
        }, 1500);
        return;
      }

      const isAdminEmail = cleanedEmail === 'admin@gmail.com' || cleanedEmail === 'example@gmail.com';

      if (isAdminEmail) {
        toast.success('Admin email identified. Bypassing email OTP verification.');
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        await updateProfile(user, { displayName: name });
        
        // Save primary user records
        try {
          await setDoc(doc(db, 'users', user.uid), {
            uid: user.uid,
            email: user.email,
            displayName: name,
            phone: phone.trim(),
            role: 'admin',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          // Initialize user profile record in 'user_profiles' collection too
          await setDoc(doc(db, 'user_profiles', user.uid), {
            uid: user.uid,
            fullName: name,
            displayName: '',
            email: user.email,
            phone: phone.trim(),
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

          // Track email registration
          await setDoc(doc(db, 'registered_emails', cleanedEmail), {
            exists: true,
            uid: user.uid,
            createdAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
        }
        
        sessionStorage.setItem('otp_verified_' + user.uid, 'true');
        toast.success('Admin account created! Logged in automatically.');
        navigate('/admin');
        return;
      }

      // 2. Start OTP session via EmailJS
      const session = await startOTPSession(email, name);
      if (session.success) {
        setShowOTP(true);
      }
    } catch (err: any) {
      toast.error(err.message || 'OTP delivery failed');
    } finally {
      setLoading(false);
    }
  };

  const handleOTPSuccess = async () => {
    setLoading(true);
    const cleanedEmail = email.toLowerCase().trim();
    try {
      // Set temporary email-based OTP verification flag to prevent AuthContext logout race condition
      localStorage.setItem('otp_verified_email_' + cleanedEmail, 'true');
      sessionStorage.setItem('otp_verified_email_' + cleanedEmail, 'true');

      // 3. User verified OTP! Now create FirebaseAuth user account
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Now lock down UID-based verification session
      localStorage.setItem('otp_verified_' + user.uid, 'true');
      sessionStorage.setItem('otp_verified_' + user.uid, 'true');
      localStorage.removeItem('otp_verified_email_' + cleanedEmail);
      sessionStorage.removeItem('otp_verified_email_' + cleanedEmail);

      await updateProfile(user, { displayName: name });
      
      // Save primary user records
      try {
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: user.email,
          displayName: name,
          phone: phone.trim(),
          role: 'user',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        // Initialize user profile record in 'user_profiles' collection too
        await setDoc(doc(db, 'user_profiles', user.uid), {
          uid: user.uid,
          fullName: name,
          displayName: '',
          email: user.email,
          phone: phone.trim(),
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

        // Track email registration
        if (user.email) {
          await setDoc(doc(db, 'registered_emails', user.email.toLowerCase().trim()), {
            exists: true,
            uid: user.uid,
            createdAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
      }
      
      toast.success('Account created and verified! Complete your profile setup.');
      // Redirect to automatic Profile Setup page
      const redirectTo = (location.state as any)?.redirectTo || '';
      navigate('/profile-setup', { state: { fromSignup: true, phone: phone.trim(), name: name, redirectTo } });
    } catch (error: any) {
      localStorage.removeItem('otp_verified_email_' + cleanedEmail);
      sessionStorage.removeItem('otp_verified_email_' + cleanedEmail);
      toast.error(error.message || 'Signup creation failed');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <ChefLoader message={showOTP ? "Wrapping up your secret recipe profile... 📖✨" : "Sending secure activation code to your inbox..."} />;
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
              <h1 className="text-4xl font-bold text-gray-900 mb-2 font-black tracking-tight">Join the Garden</h1>
              <p className="text-gray-500 text-sm">Create an account to start your culinary journey with verified security.</p>
            </div>

            <div className="bg-white p-8 md:p-10 rounded-[3rem] shadow-xl border border-gray-100 text-left">
              <form onSubmit={handlePreSignup} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700 ml-1">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      required
                      placeholder="John Doe"
                      className="w-full pl-14 pr-6 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all font-medium text-sm focus:outline-none"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                </div>

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
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                {/* 10 Digit Phone input with Indian flag/decoration */}
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700 ml-1">Mobile Number (Indian)</label>
                  <div className="relative">
                    <Phone className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <span className="absolute left-14 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400 border-r border-gray-200 pr-2">+91</span>
                    <input
                      type="tel"
                      inputMode="tel"
                      required
                      maxLength={10}
                      placeholder="9876543210"
                      className="w-full pl-26 pr-6 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all font-bold text-sm focus:outline-none"
                      value={phone}
                      onChange={(e) => setPhone(sanitizePhoneInput(e.target.value))}
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 ml-1 font-semibold">Indian numbers only. Exactly 10 digits without spaces.</p>
                </div>

                {/* Custom toggleable password block */}
                <PasswordField
                  label="Password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />

                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full py-4 rounded-2xl font-bold text-lg flex items-center justify-center transition-all ${
                    loading
                      ? 'bg-gray-200 text-gray-400'
                      : 'bg-orange-600 text-white hover:bg-orange-700 shadow-xl shadow-orange-100/50'
                  }`}
                >
                  {loading ? 'Sending verification...' : (
                    <>Verify Email & Sign Up <ArrowRight className="ml-2 w-5 h-5" /></>
                  )}
                </button>
              </form>
            </div>

            <p className="mt-8 text-center text-gray-500 text-sm font-medium">
              Already have an account?{' '}
              <Link to="/login" className="text-orange-600 font-extrabold hover:underline inline-flex items-center">
                Sign in here <LogIn className="ml-1 w-4 h-4" />
              </Link>
            </p>
          </motion.div>
        ) : (
          <OTPVerification
            email={email}
            name={name}
            purpose="signup"
            onSuccess={handleOTPSuccess}
            onCancel={() => setShowOTP(false)}
          />
        )}
      </div>
    </div>
  );
};

export default Signup;
