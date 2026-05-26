import { motion } from 'motion/react';
import React, { useState, useRef, useCallback } from 'react';

interface TabButtonProps {
  id: any;
  label: string;
  icon: any;
  isActive: boolean;
  onClick: () => void;
  onLongPress: () => void;
  key?: any;
}

export default function TabButton({ id, label, icon: Icon, isActive, onClick, onLongPress }: TabButtonProps) {
  const [isPressing, setIsPressing] = useState(false);
  const timerRef = useRef<NodeJS.Timeout>();

  const startLongPress = (e: React.PointerEvent) => {
    setIsPressing(true);
    timerRef.current = setTimeout(() => {
      onLongPress();
      setIsPressing(false);
    }, 600); // 600ms long press
  };

  const endLongPress = () => {
    clearTimeout(timerRef.current);
    if (isPressing) {
      onClick();
      setIsPressing(false);
    }
  };

  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onPointerDown={startLongPress}
      onPointerUp={endLongPress}
      onPointerLeave={endLongPress}
      onPointerCancel={endLongPress}
      className={`relative flex items-center justify-center gap-1.5 px-2 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-300 min-w-0 flex-1 md:flex-initial md:min-w-[130px] flex-shrink-0 ${
        isActive ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {isActive && (
        <motion.div
          layoutId="activeTab"
          className="absolute inset-0 bg-white rounded-xl shadow-sm border border-gray-100"
          transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
        />
      )}
      <span className="relative z-10 flex items-center justify-center gap-1.5 sm:gap-2 w-full">
        <Icon size={15} className="shrink-0" />
        <span className="whitespace-nowrap text-[11px] sm:text-sm">{label}</span>
      </span>
    </motion.button>
  );
}
