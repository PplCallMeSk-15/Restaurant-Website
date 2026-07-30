import React, { useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';

interface PasswordFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  icon?: React.ReactNode;
}

export const PasswordField: React.FC<PasswordFieldProps> = ({
  label,
  icon = <Lock className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />,
  className = '',
  id,
  ...props
}) => {
  const [showPassword, setShowPassword] = useState(false);

  const toggleVisibility = () => {
    setShowPassword((prev) => !prev);
  };

  return (
    <div className="space-y-2">
      {label && <label className="text-sm font-bold text-gray-700 ml-1">{label}</label>}
      <div className="relative">
        {icon}
        <input
          {...props}
          id={id}
          type={showPassword ? 'text' : 'password'}
          className="w-full pl-14 pr-14 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all font-medium text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
        />
        <button
          type="button"
          onClick={toggleVisibility}
          className="absolute right-5 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-700 transition-colors focus:outline-none"
          title={showPassword ? 'Hide password' : 'Show password'}
        >
          {showPassword ? (
            <EyeOff className="w-5 h-5" />
          ) : (
            <Eye className="w-5 h-5" />
          )}
        </button>
      </div>
    </div>
  );
};
