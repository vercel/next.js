'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function TrackError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
      <AlertTriangle className="text-danger h-6 w-6" />
      <p className="text-sm font-medium text-black dark:text-white">Couldn&apos;t load this track</p>
      <Button size="sm" variant="secondary" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
