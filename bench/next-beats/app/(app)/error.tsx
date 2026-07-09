'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
      <AlertTriangle className="text-danger h-8 w-8" />
      <p className="text-sm font-medium text-black dark:text-white">Something went wrong</p>
      <p className="text-gray max-w-xs text-sm">We couldn&apos;t load this page. Please try again.</p>
      <Button variant="secondary" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
