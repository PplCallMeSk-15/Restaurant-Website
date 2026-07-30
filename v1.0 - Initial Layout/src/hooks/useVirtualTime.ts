import { useState, useEffect } from 'react';
import { subscribeToSettings, AppSettings } from '../services/settingsService';
import { parseTime } from '../utils/timeUtils';

export const useVirtualTime = () => {
  const [now, setNow] = useState(new Date());
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToSettings((data) => {
      setSettings(data);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const updateTime = () => {
      let virtualNow = new Date();
      if (settings?.useManualTime && settings.manualTime && settings.manualDate && settings.manualTimeSetAt) {
        const [year, month, day] = settings.manualDate.split('-').map(Number);
        const baseDate = new Date(year, month - 1, day);
        
        const baseVirtualTime = parseTime(settings.manualTime, baseDate).getTime();
        const timeElapsed = Date.now() - settings.manualTimeSetAt;
        virtualNow = new Date(baseVirtualTime + timeElapsed);
      }
      setNow(virtualNow);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [settings]);

  return now;
};
