'use client';

import Link from 'next/link';
import { ViewTransition } from 'react';
import { usePrefetchDefault } from '@/components/demo/prefetch-provider';
import { Skeleton } from '@/components/ui/skeleton';
import type { PlaylistSummary } from '@/types/playlist';

export function PlaylistCard({ playlist }: { playlist: PlaylistSummary }) {
  const prefetch = usePrefetchDefault();
  return (
    <Link
      href={`/playlist/${playlist.id}`}
      prefetch={prefetch}
      className="group bg-card/50 hover:bg-card dark:bg-card-dark/50 dark:hover:bg-card-dark flex flex-col gap-3 rounded-lg p-3 transition-colors"
    >
      <ViewTransition name={`playlist-art-${playlist.id}`} default="none">
        <div
          className={`flex aspect-square w-full items-center justify-center rounded-md bg-gradient-to-br shadow-lg ${playlist.coverColor}`}
        >
          <svg
            className="h-1/3 w-1/3 text-white/50"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
        </div>
      </ViewTransition>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold text-black dark:text-white">{playlist.name}</span>
        <span className="text-muted truncate text-xs">
          {playlist.trackCount} {playlist.trackCount === 1 ? 'track' : 'tracks'}
        </span>
      </div>
    </Link>
  );
}

export function PlaylistList({
  playlists,
  animateItems = false,
}: {
  playlists: PlaylistSummary[];
  animateItems?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {playlists.map(pl =>
        animateItems ? (
          <ViewTransition key={pl.id} name={`playlist-card-${pl.id}`}>
            <PlaylistCard playlist={pl} />
          </ViewTransition>
        ) : (
          <PlaylistCard key={pl.id} playlist={pl} />
        ),
      )}
    </div>
  );
}

export function PlaylistCardSkeleton() {
  return (
    <div className="rounded-lg p-3">
      <Skeleton className="skeleton-subtle aspect-square w-full rounded-md" />
    </div>
  );
}

export function PlaylistListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <PlaylistCardSkeleton key={i} />
      ))}
    </div>
  );
}
