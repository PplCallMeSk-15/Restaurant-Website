import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { Mail, Lock, Key, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion } from 'motion/react';
import { PasswordField } from '../../components/PasswordField';

export default function DeliveryPartnerLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const sessionStr = localStorage.getItem('delivery_partner_session');
    if (sessionStr) {
      navigate('/delivery-partner');
    }
  }, [navigate]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('All fields are required');
      return;
    }

    setLoading(true);
    try {
      const q = query(
        collection(db, 'delivery_partners'),
        where('email', '==', email.trim())
      );
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        toast.error('We could not find any active driver with that email');
        setLoading(false);
        return;
      }

      const partnerDoc = snapshot.docs[0];
      const partnerData = partnerDoc.data();

      if (partnerData.password !== password) {
        toast.error('Incorrect password. Please verify your credentials or contact management');
        setLoading(false);
        return;
      }

      if (partnerData.active === false) {
        toast.error('Your partner profile has been deactivated by the administrator');
        setLoading(false);
        return;
      }

      // Success - Save Session
      const session = {
        id: partnerDoc.id,
        fullName: partnerData.fullName,
        email: partnerData.email,
        phone: partnerData.phone,
        vehicleType: partnerData.vehicleType,
        vehicleNumber: partnerData.vehicleNumber,
      };

      localStorage.setItem('delivery_partner_session', JSON.stringify(session));
      toast.success(`Welcome back, Driver ${partnerData.fullName}!`);
      
      navigate('/delivery-partner');
    } catch (err: any) {
      toast.error(err.message || 'Login encounter error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen pt-24 pb-20 flex items-center justify-center bg-[#FAF9F5] px-4 font-sans">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[#111] rounded-[2rem] flex items-center justify-center text-white text-3xl font-extrabold mx-auto mb-5 shadow-xl shadow-gray-200">
            D
          </div>
          <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight mb-2">Fleet Login</h1>
          <p className="text-gray-500 text-sm">Please sign in to access your assigned delivery dashboard.</p>
        </div>

        <div className="bg-white p-8 md:p-10 rounded-[3rem] shadow-xl border border-gray-100">
          <form onSubmit={handleLoginSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-700 ml-1 uppercase tracking-wider">Driver Email Address</label>
              <div className="relative">
                <Mail className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  required
                  placeholder="ramesh@spice.com"
                  className="w-full pl-14 pr-6 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all font-medium text-sm"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

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
              className={`w-full py-4 rounded-2xl font-bold text-lg flex items-center justify-center transition-all cursor-pointer ${
                loading
                  ? 'bg-gray-200 text-gray-400'
                  : 'bg-orange-600 text-white hover:bg-orange-755 shadow-xl shadow-orange-100/50'
              }`}
            >
              {loading ? 'Authenticating...' : (
                <>Sign In Driver <ArrowRight className="ml-2 w-5 h-5" /></>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-[11px] text-gray-400 leading-relaxed">
            Trouble registering or entering? Talk to the restaurant floor administrator to verify your credentials on the fleet list.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
