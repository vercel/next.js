'use client';

import { Play } from 'lucide-react';
import { Boundary } from '@/components/demo/boundary';
import { Equalizer } from '@/components/ui/equalizer';
import { usePlayer } from '@/providers/player-provider';
import type { Track } from '@/types/track';

type Props = {
  track: Track;
  queue?: Track[];
  className?: string;
  size?: 'sm' | 'md';
};

const sizes = {
  md: 'h-10 w-10',
  sm: 'h-8 w-8',
};

const iconSizes = {
  md: 'h-5 w-5',
  sm: 'h-4 w-4',
};

export function PlayButton({ track, queue, className, size = 'md' }: Props) {
  const player = usePlayer();
  const isThisPlaying = player.isPlaying && player.track?.id === track.id;

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (isThisPlaying) {
      player.pause();
    } else if (player.track?.id === track.id && !player.isPlaying) {
      player.resume();
    } else {
      player.play(track, queue);
    }
  }

  return (
    <Boundary label="PlayButton">
      <button
        type="button"
        onClick={handleClick}
        data-playing={isThisPlaying || undefined}
        aria-label={isThisPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
        className={`bg-accent flex items-center justify-center rounded-full text-white shadow-xl transition-transform hover:scale-105 ${sizes[size]} ${className ?? ''}`}
      >
        {isThisPlaying ? (
          <Equalizer size={size === 'md' ? 'md' : 'sm'} color="bg-white" />
        ) : (
          <Play className={`translate-x-[1px] ${iconSizes[size]}`} fill="currentColor" />
        )}
      </button>
    </Boundary>
  );
}
