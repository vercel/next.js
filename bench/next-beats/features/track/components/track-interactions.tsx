'use client';

import { Heart, Play } from 'lucide-react';
import Link from 'next/link';
import { useOptimistic, useTransition } from 'react';
import { Boundary } from '@/components/demo/boundary';
import { usePrefetchDefault } from '@/components/demo/prefetch-provider';
import { Equalizer } from '@/components/ui/equalizer';
import { toggleFavorite } from '@/features/track/track-actions';
import { cn } from '@/lib/utils';
import { usePlayer } from '@/providers/player-provider';
import type { Track } from '@/types/track';
import type { Route } from 'next';

export function TrackPlayRow({ track, queue, children }: { track: Track; queue?: Track[]; children: React.ReactNode }) {
  const player = usePlayer();
  const isThisPlaying = player.isPlaying && player.track?.id === track.id;
  const isThisTrack = player.track?.id === track.id;

  function handleClick() {
    if (isThisPlaying) {
      player.pause();
    } else if (player.track?.id === track.id) {
      player.resume();
    } else {
      player.play(track, queue);
    }
  }

  return (
    <Boundary label="TrackPlayRow">
      <article
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={e => {
          if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
            e.preventDefault();
            handleClick();
          }
        }}
        aria-label={isThisPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
        className={cn(
          'group/track cursor-pointer rounded-md transition-colors',
          isThisTrack ? 'bg-card/40 dark:bg-card-dark/40' : 'hover:bg-card/60 dark:hover:bg-card-dark/60',
        )}
      >
        {children}
      </article>
    </Boundary>
  );
}

export function TrackLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  const prefetch = usePrefetchDefault();
  return (
    <Link
      href={href as Route}
      prefetch={prefetch}
      onClick={e => e.stopPropagation()}
      className={cn(
        'cursor-default truncate text-sm font-medium hover:cursor-pointer hover:underline',
        className ?? 'text-black dark:text-white',
      )}
    >
      {children}
    </Link>
  );
}

export function NowPlayingTrackLink({
  trackId,
  href,
  children,
}: {
  trackId: string;
  href: string;
  children: React.ReactNode;
}) {
  const player = usePlayer();
  const isThisTrack = player.track?.id === trackId;
  return (
    <TrackLink href={href} className={isThisTrack ? 'text-accent' : 'text-black dark:text-white'}>
      {children}
    </TrackLink>
  );
}

export function NowPlayingTrackTitle({
  trackId,
  children,
  className,
}: {
  trackId: string;
  children: React.ReactNode;
  className?: string;
}) {
  const player = usePlayer();
  const isThisTrack = player.track?.id === trackId;
  return (
    <span
      className={cn(
        'truncate text-sm font-semibold',
        isThisTrack ? 'text-accent' : (className ?? 'text-black dark:text-white'),
      )}
    >
      {children}
    </span>
  );
}

export function TrackIndexCell({ trackId, index }: { trackId: string; index?: number }) {
  const player = usePlayer();
  const isPlaying = player.isPlaying && player.track?.id === trackId;
  const isCurrent = player.track?.id === trackId;

  if (isPlaying) {
    return (
      <span className="flex w-5 items-center justify-center">
        <Equalizer size="sm" />
      </span>
    );
  }

  if (isCurrent) {
    return (
      <span className="text-accent flex w-5 justify-center text-xs font-bold">
        {index !== undefined ? index + 1 : '•'}
      </span>
    );
  }

  return (
    <span className="w-5 text-right">
      {index !== undefined ? (
        <>
          <span className="text-muted font-mono text-xs group-hover/track:hidden">{index + 1}</span>
          <Play
            className="hidden h-3.5 w-3.5 text-black group-hover/track:inline dark:text-white"
            fill="currentColor"
          />
        </>
      ) : (
        <Play className="hidden h-3.5 w-3.5 text-black group-hover/track:inline dark:text-white" fill="currentColor" />
      )}
    </span>
  );
}

export function FavoriteButton({
  trackId,
  isFavorite,
  size = 'sm',
}: {
  trackId: string;
  isFavorite: boolean;
  size?: 'sm' | 'lg';
}) {
  const [, startTransition] = useTransition();
  const [optimisticFavorite, setOptimisticFavorite] = useOptimistic(isFavorite);

  function handleToggle(e: React.MouseEvent) {
    e.stopPropagation();
    startTransition(async () => {
      setOptimisticFavorite(!optimisticFavorite);
      await toggleFavorite(trackId);
    });
  }

  return (
    <Boundary label="FavoriteButton">
      <button
        type="button"
        onClick={handleToggle}
        aria-label={optimisticFavorite ? 'Remove from favorites' : 'Add to favorites'}
        className={cn(
          'rounded-full transition-colors',
          size === 'lg' ? 'p-1.5' : 'p-1.5',
          optimisticFavorite
            ? 'text-accent hover:text-accent-hover'
            : 'text-gray hover:text-black dark:hover:text-white',
        )}
      >
        <Heart className={cn(size === 'lg' ? 'h-5 w-5' : 'h-4 w-4', optimisticFavorite && 'fill-current')} />
      </button>
    </Boundary>
  );
}
