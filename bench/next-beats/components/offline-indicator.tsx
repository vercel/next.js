'use client';

import { WifiOff } from 'lucide-react';
import { useOffline } from 'next/offline';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

export function OfflineIndicator() {
  const offline = useOffline();
  const toastId = useRef<string | number | undefined>(undefined);

  useEffect(() => {
    if (offline) {
      toastId.current = toast.error("You're offline — reconnecting…", {
        duration: Infinity,
        icon: <WifiOff className="h-4 w-4" />,
      });
    } else if (toastId.current !== undefined) {
      toast.dismiss(toastId.current);
      toastId.current = undefined;
    }
  }, [offline]);

  return null;
}
