'use client';

import Link from 'next/link';
import { useSelectedLayoutSegments } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Boundary } from '@/components/demo/boundary';
import { usePrefetchDefault } from '@/components/demo/prefetch-provider';
import type { Route } from 'next';

type Props<T extends string = string> = Omit<React.ComponentProps<typeof Link>, 'href' | 'prefetch'> & {
  href: Route<T> | URL;
  // Defer this link's runtime prefetch until the user hovers/focuses it, rather
  // than firing it eagerly when the link enters the viewport. Use for unbounded
  // lists (e.g. the playlist sidebar) so N links don't each wake a server on load.
  hoverPrefetch?: boolean;
};

// `useSelectedLayoutSegments` is dynamic under `cacheComponents`, so the
// active-state computation has to live behind a Suspense boundary. The
// fallback renders the same DOM shape with `isActive=false` so React
// reconciles the resolved tree in place — no element swap, no flash.
export function NavLink<T extends string>(props: Props<T>) {
  return (
    <Boundary label="NavLink">
      <Suspense fallback={<NavLinkShell {...props} isActive={false} />}>
        <ActiveLink {...props} />
      </Suspense>
    </Boundary>
  );
}

function ActiveLink<T extends string>(props: Props<T>) {
  const segments = useSelectedLayoutSegments();
  const prefetch = usePrefetchDefault();
  const want = props.href.toString().split('?')[0].split('#')[0].split('/').filter(Boolean);
  const isActive = want.length === segments.length && want.every((s, i) => s === segments[i]);
  return <NavLinkShell {...props} isActive={isActive} prefetch={prefetch} />;
}

function NavLinkShell<T extends string>({
  href,
  isActive,
  prefetch = true,
  hoverPrefetch = false,
  onMouseEnter,
  onFocus,
  ...rest
}: Props<T> & { isActive: boolean; prefetch?: boolean }) {
  const [intent, setIntent] = useState(false);
  // With prefetch off (demo toggle) nothing prefetches. Eager links get the full
  // runtime prefetch up front; hover-gated links sit at the deduped App Shell
  // (one shared prefetch for the whole list) and upgrade to the per-link runtime
  // prefetch only once the user signals intent.
  const resolvedPrefetch = !prefetch ? false : hoverPrefetch ? (intent ? true : null) : true;
  const showIntent = () => setIntent(true);
  return (
    <Link
      prefetch={resolvedPrefetch}
      {...rest}
      href={href as Route}
      onMouseEnter={e => {
        if (hoverPrefetch) showIntent();
        onMouseEnter?.(e);
      }}
      onFocus={e => {
        if (hoverPrefetch) showIntent();
        onFocus?.(e);
      }}
      data-nav-link
      aria-current={isActive ? 'page' : undefined}
      suppressHydrationWarning
    />
  );
}
