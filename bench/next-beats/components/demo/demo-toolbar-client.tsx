'use client';

import * as Ariakit from '@ariakit/react';
import { CircleHelp, Eye, EyeOff, Timer, TimerOff, Wifi, WifiOff, Zap, ZapOff } from 'lucide-react';
import { type ButtonHTMLAttributes, type ReactNode, useEffect, useOptimistic, useState } from 'react';
import { Boundary, useBoundaryMode } from '@/components/demo/boundary';
import { togglePrefetch, toggleSlow } from '@/components/demo/demo-actions';
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

function Divider() {
  return <div className="bg-divider dark:bg-divider-dark h-5 w-px" />;
}

type ToggleButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active: boolean;
  label: string;
  icon: ReactNode;
  pending?: boolean;
};

function ToggleButton({ active, label, icon, pending, className, ...props }: ToggleButtonProps) {
  return (
    <button
      {...props}
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 transition-colors',
        'focus-visible:bg-accent/10 dark:focus-visible:bg-accent/20 focus-visible:outline-none',
        active ? 'text-accent' : 'text-gray',
        pending && 'cursor-not-allowed opacity-70',
        className,
      )}
    >
      {icon}
      <span className="hidden lg:inline">{label}</span>
    </button>
  );
}

function CookieToggle({
  enabled,
  onToggle,
  label,
  onIcon,
  offIcon,
}: {
  enabled: boolean;
  onToggle: (enable: boolean) => Promise<void>;
  label: string;
  onIcon: ReactNode;
  offIcon: ReactNode;
}) {
  const [optimistic, setOptimistic] = useOptimistic(enabled);
  const pending = optimistic !== enabled;
  return (
    <form
      action={async () => {
        setOptimistic(!optimistic);
        await onToggle(!optimistic);
        window.location.reload();
      }}
    >
      <ToggleButton
        type="submit"
        active={optimistic}
        pending={pending}
        disabled={pending}
        label={label}
        aria-label={pending ? 'Updating…' : `${label} ${optimistic ? 'on' : 'off'}`}
        icon={pending ? <Spinner className="size-3.5" /> : optimistic ? onIcon : offIcon}
      />
    </form>
  );
}

export function DemoToolbarClient({
  prefetchEnabled,
  slowEnabled,
}: {
  prefetchEnabled: boolean;
  slowEnabled: boolean;
}) {
  const { mode, toggleMode } = useBoundaryMode();
  const [offline, setOffline] = useState(false);
  const guide = Ariakit.useDialogStore();

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
      <ToggleButton
        type="button"
        onClick={toggleMode}
        active={mode === 'on'}
        aria-pressed={mode === 'on'}
        aria-label={mode === 'on' ? 'Client outlines on' : 'Client outlines off'}
        label="Client"
        icon={mode === 'on' ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
      />
      <Divider />
      <CookieToggle
        enabled={prefetchEnabled}
        onToggle={togglePrefetch}
        label="Prefetch"
        onIcon={<Zap className="size-3.5" />}
        offIcon={<ZapOff className="size-3.5" />}
      />
      <Divider />
      <CookieToggle
        enabled={slowEnabled}
        onToggle={toggleSlow}
        label="Delays"
        onIcon={<Timer className="size-3.5" />}
        offIcon={<TimerOff className="size-3.5" />}
      />
      <Divider />
      <ToggleButton
        type="button"
        onClick={toggleOffline}
        active={!offline}
        aria-pressed={offline}
        aria-label={offline ? 'Simulating offline' : 'Online'}
        label="Online"
        icon={offline ? <WifiOff className="size-3.5" /> : <Wifi className="size-3.5" />}
      />
      <Divider />
      <Ariakit.DialogDisclosure
        store={guide}
        aria-label="How this demo works"
        className="text-gray flex items-center px-3 py-1.5 transition-colors hover:text-black dark:hover:text-white"
      >
        <CircleHelp className="size-3.5" />
      </Ariakit.DialogDisclosure>
      <DemoGuideDialog
        store={guide}
        prefetch={prefetchEnabled}
        delays={slowEnabled}
        offline={offline}
        client={mode === 'on'}
      />
    </div>
  );
}

function DemoGuideDialog({
  store,
  prefetch,
  delays,
  offline,
  client,
}: {
  store: Ariakit.DialogStore;
  prefetch: boolean;
  delays: boolean;
  offline: boolean;
  client: boolean;
}) {
  const toggles = [
    {
      name: 'Client',
      on: client,
      Icon: client ? Eye : EyeOff,
      text: 'Outlines the Client Components. Everything else is server-rendered and ships no JS.',
    },
    {
      name: 'Prefetch',
      on: prefetch,
      Icon: prefetch ? Zap : ZapOff,
      text: 'Resolves the URL data (search params and dynamic params) at prefetch time, so the cached content behind it is ready before the click. Off, only the App Shell is prefetched (still instant, and it already holds your session data), so that URL content streams in after.',
    },
    {
      name: 'Delays',
      on: delays,
      Icon: delays ? Timer : TimerOff,
      text: 'Adds artificial latency to the real database queries, to prove navigation stays instant on a slow backend.',
    },
    {
      name: 'Online',
      on: !offline,
      Icon: offline ? WifiOff : Wifi,
      text: 'Go offline and pages still open to their App Shell, with prefetched data ready. Recovers when you reconnect.',
    },
  ];

  return (
    <Boundary label="DemoGuide">
      <Ariakit.Dialog
        store={store}
        backdrop={
          <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" style={{ viewTransitionName: 'none' }} />
        }
        className="border-divider dark:border-divider-dark fixed top-1/2 left-1/2 z-50 max-h-[85vh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border bg-white p-6 shadow-2xl outline-none dark:bg-black"
        style={{ viewTransitionName: 'none' }}
        unmountOnHide
      >
        <Ariakit.DialogHeading className="text-xl font-bold text-black dark:text-white">
          How this demo works
        </Ariakit.DialogHeading>
        <Ariakit.DialogDescription className="text-muted mt-2 text-sm leading-relaxed">
          A Next.js 16.3 music player showing instant navigations. The App Shell is prefetched, so navigating never
          blocks. These toggles simulate different backends, networks, and costs.
        </Ariakit.DialogDescription>

        <div className="mt-6 flex flex-col gap-4">
          {toggles.map(t => (
            <div key={t.name} className="flex items-start gap-3">
              <t.Icon className={cn('mt-0.5 size-4.5 shrink-0', t.on ? 'text-accent' : 'text-gray')} />
              <div>
                <p className="text-sm font-semibold text-black dark:text-white">{t.name}</p>
                <p className="text-muted mt-1 text-sm leading-relaxed">{t.text}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="border-divider dark:border-divider-dark mt-6 flex items-center justify-between border-t pt-4">
          <a
            className="text-accent text-sm font-medium hover:underline"
            href="https://preview.nextjs.org/docs/app/guides/instant-navigation"
            target="_blank"
            rel="noreferrer"
          >
            Read the guide
          </a>
          <Ariakit.DialogDismiss className="border-divider hover:bg-card dark:border-divider-dark dark:hover:bg-card-dark inline-flex items-center justify-center rounded-full border bg-white px-5 py-2 text-sm font-semibold text-black transition-colors dark:bg-black dark:text-white">
            Close
          </Ariakit.DialogDismiss>
        </div>
      </Ariakit.Dialog>
    </Boundary>
  );
}
