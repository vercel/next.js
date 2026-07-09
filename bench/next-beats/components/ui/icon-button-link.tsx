'use client';

import Link from 'next/link';
import { usePrefetchDefault } from '@/components/demo/prefetch-provider';
import { cn } from '@/lib/utils';
import type { Route } from 'next';
import type { ReactNode } from 'react';

export function IconButtonLink({
  href,
  label,
  className,
  children,
}: {
  href: string;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const prefetch = usePrefetchDefault();
  return (
    <Link
      href={href as Route}
      prefetch={prefetch}
      className={cn(
        'text-gray rounded-full p-1 transition-colors hover:bg-black/10 hover:text-black dark:hover:bg-white/10 dark:hover:text-white',
        className,
      )}
      aria-label={label}
      title={label}
    >
      {children}
    </Link>
  );
}

export function IconButtonLinkSkeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn('inline-block size-7 rounded-full', className)} />;
}
