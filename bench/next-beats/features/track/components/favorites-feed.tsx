import { ViewTransition } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { TrackRow } from '@/features/track/components/track-row';
import { getFavorites } from '@/features/track/track-queries';

export async function FavoritesFeed() {
  const tracks = await getFavorites();
  if (tracks.length === 0) {
    return <EmptyState title="No liked tracks yet" body="Tap the heart on a track to save it here." />;
  }
  return (
    <div className="flex flex-col gap-0.5">
      {tracks.map((track, i) => (
        <ViewTransition key={track.id}>
          <TrackRow track={track} index={i} queue={tracks} />
        </ViewTransition>
      ))}
    </div>
  );
}
