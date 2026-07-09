import { ViewTransition } from 'react';
import { AlbumCard, AlbumCardSkeleton } from '@/features/track/components/album-card';
import { getMostPlayed } from '@/features/track/track-queries';

export async function MostPlayed() {
  const tracks = await getMostPlayed(8);
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {tracks.map(track => (
        <ViewTransition key={track.id}>
          <AlbumCard track={track} />
        </ViewTransition>
      ))}
    </div>
  );
}

export function MostPlayedSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {Array.from({ length: 8 }).map((_, i) => (
        <AlbumCardSkeleton key={i} />
      ))}
    </div>
  );
}
