'use client';

import Link from 'next/link';
import { ViewTransition } from 'react';
import { usePrefetchDefault } from '@/components/demo/prefetch-provider';
import { Skeleton } from '@/components/ui/skeleton';
import { PlayButton } from '@/features/track/components/play-button';
import { NowPlayingTrackTitle } from '@/features/track/components/track-interactions';
import type { Track } from '@/types/track';

export function AlbumCard({ track }: { track: Track }) {
  const prefetch = usePrefetchDefault();
  return (
    <Link
      href={`/track/${track.id}`}
      prefetch={prefetch}
      className="group bg-card/50 hover:bg-card dark:bg-card-dark/50 dark:hover:bg-card-dark flex flex-col gap-3 rounded-lg p-3 transition-colors"
    >
      <div className="relative">
        <ViewTransition name={`track-art-${track.id}`} default="none">
          <div
            className={`flex aspect-square w-full items-center justify-center rounded-md bg-gradient-to-br shadow-lg ${track.coverColor}`}
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
        <PlayButton track={track} className="card-play-btn absolute right-2 bottom-2" />
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <NowPlayingTrackTitle trackId={track.id}>{track.title}</NowPlayingTrackTitle>
        <span className="text-muted truncate text-xs">{track.artist}</span>
      </div>
    </Link>
  );
}

export function AlbumCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-lg p-3">
      <Skeleton className="skeleton-subtle aspect-square w-full rounded-md" />
      <div className="flex flex-col gap-1.5">
        <Skeleton className="skeleton-subtle h-4 w-3/4" />
        <Skeleton className="skeleton-subtle h-3 w-1/2" />
      </div>
    </div>
  );
}
