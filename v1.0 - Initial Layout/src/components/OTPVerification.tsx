import React, { useState, useEffect, useRef } from 'react';
import { startOTPSession, verifyOTP } from '../services/otpService';
import { Mail, ShieldCheck, RefreshCw, ArrowLeft, KeyRound } from 'lucide-react';
import { motion } from 'motion/react';
import toast from 'react-hot-toast';

interface OTPVerificationProps {
  email: string;
  name: string;
  onSuccess: () => void;
  onCancel: () => void;
  purpose: 'signup' | 'login';
}

export const OTPVerification: React.FC<OTPVerificationProps> = ({
  email,
  name,
  onSuccess,
  onCancel,
  purpose
}) => {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''));
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [expiresMin, setExpiresMin] = useState(5);
  const [expiresSec, setExpiresSec] = useState(0);
  const inputRefs = useRef<HTMLInputElement[]>([]);

  // 1. Synchronize expiration timer (5 mins)
  useEffect(() => {
    let timer = setInterval(() => {
      setExpiresSec((prevSec) => {
        if (prevSec === 0) {
          if (expiresMin === 0) {
            clearInterval(timer);
            return 0;
          }
          setExpiresMin((m) => m - 1);
          return 59;
        }
        return prevSec - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [expiresMin]);

  // 2. Synchronize resend cooldown (30 seconds)
  useEffect(() => {
    let cdTimer: NodeJS.Timeout;
    if (cooldown > 0) {
      cdTimer = setInterval(() => {
        setCooldown((c) => c - 1);
      }, 1000);
    }
    return () => clearInterval(cdTimer);
  }, [cooldown]);

  // Focus the first input field on load
  useEffect(() => {
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, []);

  const handleChange = (index: number, value: string) => {
    const cleanVal = value.replace(/[^0-9]/g, '');
    if (!cleanVal) {
      const newDigits = [...digits];
      newDigits[index] = '';
      setDigits(newDigits);
      return;
    }

    const newDigits = [...digits];
    newDigits[index] = cleanVal[cleanVal.length - 1]; // take last character inputted
    setDigits(newDigits);

    // Auto focus next field
    if (index < 5 && inputRefs.current[index + 1]) {
      inputRefs.current[index + 1].focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      const newDigits = [...digits];
      
      if (digits[index] === '') {
        // Move focus backward if current is empty
        if (index > 0 && inputRefs.current[index - 1]) {
          inputRefs.current[index - 1].focus();
          newDigits[index - 1] = '';
        }
      } else {
        newDigits[index] = '';
      }
      setDigits(newDigits);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text').trim().replace(/[^0-9]/g, '').slice(0, 6);
    if (pasteData.length > 0) {
      const newDigits = [...digits];
      for (let i = 0; i < pasteData.length; i++) {
        newDigits[i] = pasteData[i];
      }
      setDigits(newDigits);
      
      // Auto-focus last pasted element
      const focusIdx = Math.min(pasteData.length, 5);
      if (inputRefs.current[focusIdx]) {
        inputRefs.current[focusIdx].focus();
      }
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const otpCode = digits.join('');
    if (otpCode.length !== 6) {
      toast.error('Please enter the full 6-digit verification code.');
      return;
    }

    setLoading(true);
    try {
      const check = await verifyOTP(email, otpCode);
      if (check.success) {
        toast.success(check.message);
        onSuccess();
      } else {
        toast.error(check.message);
      }
    } catch (err: any) {
      toast.error(err.message || 'Verification process encountered an error.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    setLoading(true);
    try {
      const res = await startOTPSession(email, name);
      if (res.success) {
        setCooldown(30);
        setExpiresMin(5);
        setExpiresSec(0);
        setDigits(Array(6).fill(''));
        if (inputRefs.current[0]) {
          inputRefs.current[0].focus();
        }
      }
    } catch (err: any) {
      toast.error('Could not request resend: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto bg-white p-8 md:p-10 rounded-[3rem] border border-gray-100 shadow-xl text-center">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <div className="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center text-orange-600 mx-auto mb-6">
          <ShieldCheck className="w-8 h-8" />
        </div>

        <h2 className="text-2xl font-black text-gray-900 mb-2">Security Verification</h2>
        <p className="text-gray-500 text-sm mb-6">
          We sent a 6-digit verification code to
          <span className="block font-bold text-gray-800 break-all mt-1">{email}</span>
        </p>

        {/* Spam Check Info Callout */}
        <div className="mb-6 p-4 bg-orange-50/50 border border-orange-150 rounded-2xl text-left shadow-sm">
          <p className="text-xs font-semibold text-orange-950 leading-relaxed flex items-start gap-2.5">
            <span className="text-sm select-none mt-0.5">📨</span>
            <span>
              Verification email sent successfully. Please check your inbox, and <strong>don't forget to check your Spam or Junk folder</strong> if you don't see it.
            </span>
          </p>
        </div>

        {/* Warning Timer */}
        <div className="mb-6 inline-flex items-center gap-1.5 px-3 py-1 bg-red-50 text-red-600 text-xs font-bold rounded-full">
          <span>⏱️ Expires in: {expiresMin}:{expiresSec < 10 ? `0${expiresSec}` : expiresSec}</span>
        </div>

        {/* 6 Digit Input boxes */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex gap-2 justify-center" onPaste={handlePaste}>
            {digits.map((digit, index) => (
              <input
                key={index}
                id={`otp-input-${index}`}
                ref={(el) => { if (el) inputRefs.current[index] = el; }}
                type="text"
                pattern="[0-9]*"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                className="w-12 h-14 bg-gray-50 text-center text-xl font-black text-orange-600 border-none rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all shadow-sm"
              />
            ))}
          </div>

          <button
            type="submit"
            disabled={loading || digits.join('').length !== 6}
            className={`w-full py-4 rounded-2xl font-bold text-lg flex items-center justify-center transition-all ${
              loading || digits.join('').length !== 6
                ? 'bg-gray-150 text-gray-400 cursor-not-allowed'
                : 'bg-orange-600 text-white hover:bg-orange-700 shadow-xl shadow-orange-150/50'
            }`}
          >
            {loading ? 'Verifying...' : 'Verify OTP'}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-gray-100 flex flex-col justify-center items-center gap-4">
          {/* Resend Action */}
          <button
            type="button"
            disabled={cooldown > 0 || loading}
            onClick={handleResend}
            className={`font-semibold text-xs flex items-center gap-1.5 transition-all text-orange-600 hover:underline ${
              cooldown > 0 ? 'text-gray-400 hover:no-underline cursor-not-allowed' : ''
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {cooldown > 0 ? `Resend Code in ${cooldown}s` : 'Resend Verification Code'}
          </button>

          {/* Go Back / Cancel */}
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-bold text-gray-500 hover:text-gray-800 transition-all flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to form
          </button>
        </div>
      </motion.div>
    </div>
  );
};
