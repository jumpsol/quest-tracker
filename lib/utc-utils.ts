// UTC Timezone Utilities for Quest Tracker

/**
 * Get current UTC date as YYYY-MM-DD string
 */
export function getUTCDateString(date: Date = new Date()): string {
  return date.toISOString().split('T')[0];
}

/**
 * Get UTC day start and end timestamps
 */
export function getUTCDayBounds(dateString?: string): { start: number; end: number } {
  const date = dateString ? new Date(dateString + 'T00:00:00Z') : new Date();
  
  if (!dateString) {
    // Today's bounds in UTC
    const start = new Date(Date.UTC(
      date.getUTCFullYear(), 
      date.getUTCMonth(), 
      date.getUTCDate(), 
      0, 0, 0, 0
    ));
    const end = new Date(Date.UTC(
      date.getUTCFullYear(), 
      date.getUTCMonth(), 
      date.getUTCDate(), 
      23, 59, 59, 999
    ));
    return { 
      start: Math.floor(start.getTime() / 1000), 
      end: Math.floor(end.getTime() / 1000) 
    };
  }
  
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setUTCHours(23, 59, 59, 999);
  
  return { 
    start: Math.floor(start.getTime() / 1000), 
    end: Math.floor(end.getTime() / 1000) 
  };
}

/**
 * Get time remaining until UTC midnight (00:00 UTC)
 */
export function getTimeUntilUTCMidnight(): { hours: number; minutes: number; seconds: number; totalSeconds: number } {
  const now = new Date();
  
  // Calculate next UTC midnight
  const nextMidnight = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1, // Tomorrow
    0, 0, 0, 0
  ));
  
  const diffMs = nextMidnight.getTime() - now.getTime();
  const totalSeconds = Math.floor(diffMs / 1000);
  
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  return { hours, minutes, seconds, totalSeconds };
}

/**
 * Check if a timestamp is from today (UTC)
 */
export function isToday(timestamp: number): boolean {
  const date = new Date(timestamp * 1000);
  const today = new Date();
  
  return (
    date.getUTCFullYear() === today.getUTCFullYear() &&
    date.getUTCMonth() === today.getUTCMonth() &&
    date.getUTCDate() === today.getUTCDate()
  );
}

/**
 * Format date for display with UTC indicator
 */
export function formatUTCDate(date: Date = new Date()): string {
  return date.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }) + ' (UTC)';
}

/**
 * Check if quest was completed today (UTC)
 */
export function wasCompletedToday(lastVerifiedDate: string | null): boolean {
  if (!lastVerifiedDate) return false;
  return lastVerifiedDate === getUTCDateString();
}

/**
 * Calculate streak based on UTC dates
 */
export function calculateStreak(completionDates: string[]): number {
  if (!completionDates || completionDates.length === 0) return 0;
  
  // Sort dates in descending order
  const sortedDates = [...completionDates].sort((a, b) => 
    new Date(b).getTime() - new Date(a).getTime()
  );
  
  let streak = 0;
  const today = getUTCDateString();
  const yesterday = getUTCDateString(new Date(Date.now() - 86400000));
  
  // Check if streak is still active (completed today or yesterday)
  if (sortedDates[0] !== today && sortedDates[0] !== yesterday) {
    return 0;
  }
  
  // Count consecutive days
  let expectedDate = sortedDates[0];
  
  for (const date of sortedDates) {
    if (date === expectedDate) {
      streak++;
      // Calculate previous day
      const prevDate = new Date(expectedDate + 'T00:00:00Z');
      prevDate.setUTCDate(prevDate.getUTCDate() - 1);
      expectedDate = getUTCDateString(prevDate);
    } else if (date < expectedDate) {
      // Skip dates before expected (there might be gaps)
      break;
    }
  }
  
  return streak;
}
