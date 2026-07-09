'use client';

import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useRef, useTransition } from 'react';
import { Boundary } from '@/components/demo/boundary';
import { SeedFromSearchParam } from '@/components/scripts/seed-from-search-param';
import { Spinner } from '@/components/ui/spinner';
import { useSyncInputToSearchParam } from '@/hooks/use-sync-input-to-search-param';
import type { Route } from 'next';

export function SearchInput() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [isPending, startTransition] = useTransition();

  useSyncInputToSearchParam(inputRef, 'q');

  return (
    <Boundary label="SearchInput">
      <div className="relative">
        {isPending ? (
          <Spinner className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 opacity-40" />
        ) : (
          <Search className="text-gray pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2" />
        )}
        <input
          ref={inputRef}
          id={inputId}
          type="search"
          name="q"
          autoFocus
          autoComplete="off"
          aria-label="Search tracks"
          placeholder="What do you want to listen to?"
          suppressHydrationWarning
          onChange={e => {
            const value = e.target.value;
            startTransition(() => {
              router.replace(value ? (`/search?q=${encodeURIComponent(value)}` as Route) : '/search');
            });
          }}
          className="!rounded-full !py-3 !pr-4 !pl-12 !text-base"
        />
        <SeedFromSearchParam targetId={inputId} param="q" />
      </div>
    </Boundary>
  );
}
