'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

const MILESTONES: [number, string][] = [
  [60, '♪ No MP3s were harmed in the making of this music'],
  [300, '♪ 5 min of math → sound — all Web Audio API'],
  [600, '♪ 10 min. You should probably ship something'],
];

export function useListeningMilestones(isPlaying: boolean) {
  const listenedRef = useRef(0);
  const milestonesHit = useRef(new Set<number>());

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      listenedRef.current += 1;
      const s = listenedRef.current;
      for (const [threshold, message] of MILESTONES) {
        if (s >= threshold && !milestonesHit.current.has(threshold)) {
          milestonesHit.current.add(threshold);
          toast(message, { id: 'easter-egg', duration: 15000 });
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying]);
}
