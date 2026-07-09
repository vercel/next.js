import { ViewTransition } from 'react';
import { AlbumCard, AlbumCardSkeleton } from '@/features/track/components/album-card';
import { getDiscover } from '@/features/track/track-queries';

export async function Discover() {
  const tracks = await getDiscover(8);
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

export function DiscoverSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <AlbumCardSkeleton key={i} />
      ))}
    </div>
  );
}
