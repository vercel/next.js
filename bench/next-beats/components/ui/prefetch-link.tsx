'use client';

import Link from 'next/link';
import { usePrefetchDefault } from '@/components/demo/use-prefetch-default';
import type { Route } from 'next';

type Props<T extends string = string> = Omit<React.ComponentProps<typeof Link>, 'href' | 'prefetch'> & {
  href: Route<T> | URL;
};

export function PrefetchLink<T extends string>({ href, ...props }: Props<T>) {
  return <Link {...props} href={href as Route} prefetch={usePrefetchDefault()} />;
}
