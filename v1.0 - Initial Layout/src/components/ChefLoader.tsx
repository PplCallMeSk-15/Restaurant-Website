import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ChefHat } from 'lucide-react';

interface ChefLoaderProps {
  message?: string;
  fullscreen?: boolean;
}

const MESSAGES = [
  "Awakening the spices...",
  "Stirring up the clay oven...",
  "Selecting fresh garden ingredients...",
  "Assembling your gourmet feast...",
  "Adding a dash of secret masala...",
  "Garnishing with premium herbs..."
];

export const ChefLoader: React.FC<ChefLoaderProps> = ({ message, fullscreen = true }) => {
  const [displayText, setDisplayText] = useState(message || MESSAGES[0]);

  useEffect(() => {
    if (fullscreen) {
      // Freeze body scroll on mobile and desktop
      const originalStyle = window.getComputedStyle(document.body).overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [fullscreen]);

  useEffect(() => {
    if (message) {
      setDisplayText(message);
      return;
    }
    const interval = setInterval(() => {
      setDisplayText(prev => {
        const currentIndex = MESSAGES.indexOf(prev);
        const nextIndex = (currentIndex + 1) % MESSAGES.length;
        return MESSAGES[nextIndex];
      });
    }, 2500);
    return () => clearInterval(interval);
  }, [message]);

  const loaderContent = (
    <div className="flex flex-col items-center justify-center p-8 text-center select-none">
      {/* Visual Animation Box */}
      <div className="relative w-32 h-32 flex items-center justify-center mb-6">
        {/* Glow behind the scene */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-tr from-orange-400/20 to-orange-500/20 rounded-full blur-xl"
          animate={{
            scale: [1, 1.15, 0.95, 1],
            opacity: [0.6, 0.9, 0.7, 0.6]
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />

        {/* Ring Orbit animation */}
        <motion.div
          className="absolute w-28 h-28 border-2 border-dashed border-orange-500/30 rounded-full animate-spin [animation-duration:15s]"
        />

        {/* Sizzling Flame under pot */}
        <div className="absolute bottom-4 flex gap-1 justify-center z-0">
          {[1, 2, 3].map((val) => (
            <motion.div
              key={val}
              className="w-2.5 bg-gradient-to-t from-red-600 to-orange-500 rounded-full"
              style={{ height: 16 }}
              animate={{
                height: [14, 24, 12, 18][val % 4],
                y: [0, -4, 0][val % 3],
              }}
              transition={{
                duration: 0.6 + val * 0.1,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />
          ))}
        </div>

        {/* Main Cooking Pot/Pan container */}
        <motion.div
          className="relative bg-white text-orange-600 p-5 rounded-[2rem] shadow-lg border border-orange-50/50 z-10 flex items-center justify-center cursor-pointer"
          animate={{
            y: [0, -10, 2, 0],
            rotate: [0, -3, 3, 0],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        >
          <ChefHat className="w-12 h-12 text-orange-600" />
        </motion.div>

        {/* Floating rising aromatic particles (Spices!) */}
        {[
          { color: 'bg-green-500', delay: 0, x: -20 },
          { color: 'bg-yellow-500', delay: 0.4, x: 20 },
          { color: 'bg-orange-500', delay: 0.8, x: -5 },
          { color: 'bg-red-500', delay: 1.2, x: 15 },
        ].map((spice, idx) => (
          <motion.div
            key={idx}
            className={`absolute w-2 h-2 rounded-full ${spice.color}`}
            initial={{ opacity: 0, y: 15, x: spice.x }}
            animate={{
              opacity: [0, 1, 0.8, 0],
              y: [-10, -55, -75],
              x: [spice.x, spice.x + (idx % 2 === 0 ? 10 : -10), spice.x + (idx % 2 === 0 ? -10 : 10)]
            }}
            transition={{
              duration: 2.5,
              delay: spice.delay,
              repeat: Infinity,
              ease: "easeOut"
            }}
          />
        ))}

        {/* Steam Waves */}
        {[0, 1].map((wave) => (
          <motion.svg
            key={wave}
            className="absolute text-orange-300 opacity-65 w-6 h-12"
            style={{
              top: 5,
              left: wave === 0 ? '35%' : '55%',
            }}
            viewBox="0 0 24 48"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            animate={{
              opacity: [0, 0.7, 0],
              y: [-5, -35],
              x: [0, wave === 0 ? -6 : 6, 0]
            }}
            transition={{
              duration: 2.2,
              delay: wave * 1.1,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          >
            <path d="M12,40 C18,30 6,20 12,10 C18,0-6,0 12,-10" />
          </motion.svg>
        ))}
      </div>

      {/* Message Text */}
      <motion.p
        className="text-base font-extrabold text-gray-950 tracking-wide uppercase min-h-[1.5rem] bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent px-4 animate-pulse"
      >
        {displayText}
      </motion.p>
      
      <p className="text-xs text-gray-400 mt-1 font-mono tracking-wider font-semibold">
        SPICE GARDEN KITCHEN
      </p>
    </div>
  );

  if (fullscreen) {
    return (
      <div className="fixed -inset-10 bg-white/95 backdrop-blur-md z-[9999] flex items-center justify-center overflow-hidden touch-none select-none">
        <div className="scale-95 md:scale-100">
          {loaderContent}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex justify-center py-10 bg-white rounded-[2.5rem] border border-gray-100 shadow-inner">
      {loaderContent}
    </div>
  );
};
