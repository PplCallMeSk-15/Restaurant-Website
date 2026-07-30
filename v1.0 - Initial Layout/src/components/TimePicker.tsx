import React from 'react';
import { Clock } from 'lucide-react';

interface TimePickerProps {
  value: string; // "HH:MM AM/PM" or "HH:MM" (24h)
  onChange: (time: string) => void;
  label?: string;
  className?: string;
}

export const TimePicker: React.FC<TimePickerProps> = ({ value, onChange, label, className = "" }) => {
  // Parse existing value
  let initialHours = "12";
  let initialMinutes = "00";
  let initialPeriod = "AM";

  if (value) {
    if (value.includes(' ')) {
      // 12h format: "05:30 PM"
      const [time, period] = value.split(' ');
      const [h, m] = time.split(':');
      initialHours = h;
      initialMinutes = m;
      initialPeriod = period;
    } else if (value.includes(':')) {
      // 24h format: "14:30"
      const [hStr, mStr] = value.split(':');
      let h = parseInt(hStr);
      initialPeriod = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      initialHours = String(h).padStart(2, '0');
      initialMinutes = mStr;
    }
  }

  const hours = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
  const periods = ['AM', 'PM'];

  const updateTime = (h: string, m: string, p: string) => {
    onChange(`${h}:${m} ${p}`);
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {label && <label className="text-xs font-bold text-gray-700 ml-1">{label}</label>}
      <div className="flex gap-2 items-center bg-gray-50 p-2 rounded-2xl border border-gray-100">
        <Clock className="w-4 h-4 text-gray-400 ml-2" />
        
        {/* Hours */}
        <select 
          className="bg-transparent border-none focus:ring-0 font-bold text-gray-900 cursor-pointer"
          value={initialHours}
          onChange={(e) => updateTime(e.target.value, initialMinutes, initialPeriod)}
        >
          {hours.map(h => <option key={h} value={h}>{h}</option>)}
        </select>

        <span className="font-bold text-gray-400">:</span>

        {/* Minutes */}
        <select 
          className="bg-transparent border-none focus:ring-0 font-bold text-gray-900 cursor-pointer"
          value={initialMinutes}
          onChange={(e) => updateTime(initialHours, e.target.value, initialPeriod)}
        >
          {minutes.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        {/* Period */}
        <select 
          className="bg-transparent border-none focus:ring-0 font-bold text-orange-600 font-black cursor-pointer"
          value={initialPeriod}
          onChange={(e) => updateTime(initialHours, initialMinutes, e.target.value)}
        >
          {periods.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
    </div>
  );
};
