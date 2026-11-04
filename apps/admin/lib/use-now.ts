'use client';
import { useEffect, useState } from 'react';

/** Re-renders on an interval so elapsed timers and greetings stay live without refetching. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
