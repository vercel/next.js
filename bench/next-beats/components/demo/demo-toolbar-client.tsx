'use client';

import { Eye, EyeOff, Wifi, WifiOff, Zap, ZapOff } from 'lucide-react';
import { useEffect, useOptimistic, useState } from 'react';
import { useBoundaryMode } from '@/components/demo/boundary-provider';
import { togglePrefetch } from '@/components/demo/demo-actions';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

let originalFetch: typeof fetch | null = null;

function setSimulatedOffline(offline: boolean) {
  if (typeof window === 'undefined') return;
  if (offline) {
    if (!originalFetch) originalFetch = window.fetch.bind(window);
    window.fetch = () => Promise.reject(new TypeError('Failed to fetch (demo offline)'));
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    window.dispatchEvent(new Event('offline'));
  } else {
    if (originalFetch) {
      window.fetch = originalFetch;
      originalFetch = null;
    }
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
    window.dispatchEvent(new Event('online'));
  }
}

export function DemoToolbarClient({ prefetchEnabled }: { prefetchEnabled: boolean }) {
  const { mode, toggleMode } = useBoundaryMode();
  const [optimisticPrefetch, setOptimisticPrefetch] = useOptimistic(prefetchEnabled);
  const prefetchPending = optimisticPrefetch !== prefetchEnabled;
  const [offline, setOffline] = useState(false);

  useEffect(() => () => setSimulatedOffline(false), []);

  function toggleOffline() {
    const next = !offline;
    setSimulatedOffline(next);
    setOffline(next);
  }

  return (
    <div
      style={{ viewTransitionName: 'demo-toolbar' }}
      className={cn(
        'flex items-center overflow-hidden rounded-full border text-xs font-medium shadow-sm backdrop-blur-md transition-colors',
        'border-divider dark:border-divider-dark bg-white/80 dark:bg-black/80',
      )}
    >
      <button
        type="button"
        onClick={toggleMode}
        aria-label={mode === 'on' ? 'Client outlines on' : 'Client outlines off'}
        aria-pressed={mode === 'on'}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 transition-colors',
          mode === 'on' ? 'text-accent' : 'text-gray',
        )}
      >
        {mode === 'on' ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
        <span className="hidden lg:inline">Client</span>
      </button>

      <div className="bg-divider dark:bg-divider-dark h-5 w-px" />

      <form
        action={async () => {
          setOptimisticPrefetch(!optimisticPrefetch);
          await togglePrefetch(!optimisticPrefetch);
          window.location.reload();
        }}
      >
        <button
          type="submit"
          disabled={prefetchPending}
          aria-label={prefetchPending ? 'Updating…' : optimisticPrefetch ? 'Prefetch on' : 'Prefetch off'}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 transition-colors',
            optimisticPrefetch ? 'text-accent' : 'text-gray',
            prefetchPending && 'cursor-not-allowed opacity-70',
          )}
        >
          {prefetchPending ? (
            <Spinner className="size-3.5" />
          ) : optimisticPrefetch ? (
            <Zap className="size-3.5" />
          ) : (
            <ZapOff className="size-3.5" />
          )}
          <span className="hidden lg:inline">Prefetch</span>
        </button>
      </form>

      <div className="bg-divider dark:bg-divider-dark h-5 w-px" />

      <button
        type="button"
        onClick={toggleOffline}
        aria-label={offline ? 'Simulating offline' : 'Online'}
        aria-pressed={offline}
        className={cn('flex items-center gap-1.5 px-3 py-1.5 transition-colors', offline ? 'text-gray' : 'text-accent')}
      >
        {offline ? <WifiOff className="size-3.5" /> : <Wifi className="size-3.5" />}
        <span className="hidden lg:inline">Online</span>
      </button>
    </div>
  );
}
