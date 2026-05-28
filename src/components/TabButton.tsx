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
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const startLongPress = (e: React.PointerEvent) => {
    setIsPressing(true);
    touchStartRef.current = { x: e.clientX, y: e.clientY };
    timerRef.current = setTimeout(() => {
      onLongPress();
      setIsPressing(false);
    }, 950); // 950ms long press is much more deliberate
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!touchStartRef.current) return;
    const dx = e.clientX - touchStartRef.current.x;
    const dy = e.clientY - touchStartRef.current.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > 10) { // cancel if swiped/scrolled or drifted
      clearTimeout(timerRef.current);
      setIsPressing(false);
      touchStartRef.current = null;
    }
  };

  const endLongPress = () => {
    clearTimeout(timerRef.current);
    touchStartRef.current = null;
    if (isPressing) {
      onClick();
      setIsPressing(false);
    }
  };

  const cancelLongPress = () => {
    clearTimeout(timerRef.current);
    setIsPressing(false);
    touchStartRef.current = null;
  };

  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onPointerDown={startLongPress}
      onPointerUp={endLongPress}
      onPointerMove={handlePointerMove}
      onPointerLeave={cancelLongPress}
      onPointerCancel={cancelLongPress}
      className={`relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 flex-shrink-0 ${
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
      <span className="relative z-10 flex items-center gap-2">
        <Icon size={16} />
        <span className="whitespace-nowrap">{label}</span>
      </span>
    </motion.button>
  );
}
