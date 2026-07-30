import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

interface AuthContextType {
  user: User | null;
  profile: any | null;
  loading: boolean;
  isAdmin: boolean;
  verifySessionOtp: (uid: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  verifySessionOtp: async () => {},
  refreshProfile: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionVerified, setSessionVerified] = useState(false);

  const fetchProfileData = async (currentUser: User) => {
    // Basic fallback properties from the authenticated Auth state
    const merged: any = { 
      uid: currentUser.uid, 
      email: currentUser.email,
      displayName: currentUser.displayName || 'Guest',
      role: 'user'
    };

    try {
      const userRef = doc(db, 'users', currentUser.uid);
      const profileRef = doc(db, 'user_profiles', currentUser.uid);

      // Fetch standard user record and profile details in parallel
      const [userSnap, profileSnap] = await Promise.all([
        getDoc(userRef).catch(err => {
          console.warn("Could not fetch standard user record:", err);
          return null;
        }),
        getDoc(profileRef).catch(err => {
          console.warn("Could not fetch user profile details:", err);
          return null;
        })
      ]);

      if (userSnap && userSnap.exists()) {
        const uData = userSnap.data();
        Object.keys(uData).forEach(key => {
          merged[key] = uData[key];
        });
      }

      if (profileSnap && profileSnap.exists()) {
        const pData = profileSnap.data();
        Object.keys(pData).forEach(key => {
          merged[key] = pData[key];
        });
      }
    } catch (globalErr) {
      console.warn("Global profile retrieval issue:", globalErr);
    }

    setProfile(merged);
  };

  const refreshProfile = async () => {
    if (auth.currentUser) {
      await fetchProfileData(auth.currentUser);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        // Check if OTP verified for password users
        const isPasswordUser = currentUser.providerData.some(p => p.providerId === 'password');
        const isAdminEmail = currentUser.email === 'admin@gmail.com' || currentUser.email === 'example@gmail.com';
        
        const emailKey = currentUser.email ? 'otp_verified_email_' + currentUser.email.toLowerCase().trim() : null;
        const isEmailVerified = emailKey ? (localStorage.getItem(emailKey) === 'true' || sessionStorage.getItem(emailKey) === 'true') : false;

        const isVerified = (isPasswordUser && !isAdminEmail)
          ? (localStorage.getItem('otp_verified_' + currentUser.uid) === 'true' || 
             sessionStorage.getItem('otp_verified_' + currentUser.uid) === 'true' ||
             isEmailVerified)
          : true;

        if (isVerified) {
          if (currentUser.uid) {
            localStorage.setItem('otp_verified_' + currentUser.uid, 'true');
            sessionStorage.setItem('otp_verified_' + currentUser.uid, 'true');
          }
          setUser(currentUser);
          await fetchProfileData(currentUser);
        } else {
          setUser(null);
          setProfile(null);
        }
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [sessionVerified]);

  const verifySessionOtp = async (uid: string) => {
    localStorage.setItem('otp_verified_' + uid, 'true');
    sessionStorage.setItem('otp_verified_' + uid, 'true');
    setSessionVerified(true);
    if (auth.currentUser) {
      setUser(auth.currentUser);
      await fetchProfileData(auth.currentUser);
    }
  };

  const isAdmin = profile?.role === 'admin' || user?.email === 'admin@gmail.com' || user?.email === 'example@gmail.com';

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, verifySessionOtp, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
