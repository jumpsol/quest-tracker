'use client';

import { useState, useEffect } from 'react';
import { Clock, Globe } from 'lucide-react';

interface UTCResetTimerProps {
  className?: string;
  showLabel?: boolean;
  compact?: boolean;
}

export function UTCResetTimer({ className = '', showLabel = true, compact = false }: UTCResetTimerProps) {
  const [timeLeft, setTimeLeft] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    const calculateTimeLeft = () => {
      const now = new Date();
      
      // Next UTC midnight
      const nextMidnight = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1,
        0, 0, 0, 0
      ));
      
      const diffMs = nextMidnight.getTime() - now.getTime();
      const totalSeconds = Math.floor(diffMs / 1000);
      
      return {
        hours: Math.floor(totalSeconds / 3600),
        minutes: Math.floor((totalSeconds % 3600) / 60),
        seconds: totalSeconds % 60,
      };
    };

    setTimeLeft(calculateTimeLeft());
    
    const interval = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  if (!mounted) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="animate-pulse bg-gray-700 rounded h-8 w-24"></div>
      </div>
    );
  }

  if (compact) {
    return (
      <div className={`flex items-center gap-2 text-sm ${className}`}>
        <Globe className="w-4 h-4 text-blue-400" />
        <span className="font-mono text-gray-300">
          {String(timeLeft.hours).padStart(2, '0')}:
          {String(timeLeft.minutes).padStart(2, '0')}:
          {String(timeLeft.seconds).padStart(2, '0')}
        </span>
        <span className="text-gray-500 text-xs">UTC</span>
      </div>
    );
  }

  return (
    <div className={`${className}`}>
      {showLabel && (
        <div className="flex items-center gap-2 text-gray-400 text-sm mb-2">
          <Globe className="w-4 h-4" />
          <span>Resets in</span>
          <span className="text-xs text-blue-400/70">(UTC)</span>
        </div>
      )}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700/50 rounded-lg px-3 py-2 min-w-[52px] text-center">
            <span className="text-2xl font-bold text-white font-mono">
              {String(timeLeft.hours).padStart(2, '0')}
            </span>
            <span className="text-xs text-gray-500 block -mt-1">H</span>
          </div>
          <span className="text-gray-600 text-xl font-bold">:</span>
          <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700/50 rounded-lg px-3 py-2 min-w-[52px] text-center">
            <span className="text-2xl font-bold text-white font-mono">
              {String(timeLeft.minutes).padStart(2, '0')}
            </span>
            <span className="text-xs text-gray-500 block -mt-1">M</span>
          </div>
          {!compact && (
            <>
              <span className="text-gray-600 text-xl font-bold">:</span>
              <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700/50 rounded-lg px-3 py-2 min-w-[52px] text-center">
                <span className="text-2xl font-bold text-white font-mono">
                  {String(timeLeft.seconds).padStart(2, '0')}
                </span>
                <span className="text-xs text-gray-500 block -mt-1">S</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Hook for using UTC time in other components
export function useUTCTime() {
  const [utcTime, setUtcTime] = useState({
    date: '',
    time: '',
    hours: 0,
    minutes: 0,
    seconds: 0,
    timeUntilReset: { hours: 0, minutes: 0, seconds: 0 },
  });

  useEffect(() => {
    const update = () => {
      const now = new Date();
      
      // Next UTC midnight
      const nextMidnight = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1,
        0, 0, 0, 0
      ));
      
      const diffMs = nextMidnight.getTime() - now.getTime();
      const totalSeconds = Math.floor(diffMs / 1000);
      
      setUtcTime({
        date: now.toISOString().split('T')[0],
        time: now.toISOString().split('T')[1].substring(0, 8),
        hours: now.getUTCHours(),
        minutes: now.getUTCMinutes(),
        seconds: now.getUTCSeconds(),
        timeUntilReset: {
          hours: Math.floor(totalSeconds / 3600),
          minutes: Math.floor((totalSeconds % 3600) / 60),
          seconds: totalSeconds % 60,
        },
      });
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return utcTime;
}
