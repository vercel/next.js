import { TrackList, TrackListSkeleton } from '@/features/track/components/track-row';
import { getTrack, getTracksByGenre } from '@/features/track/track-queries';

export async function MoreFromGenre({ trackId }: { trackId: string }) {
  const track = await getTrack(trackId);
  const tracks = await getTracksByGenre(track.genre);
  const filtered = tracks.filter(t => t.id !== trackId).slice(0, 5);
  if (filtered.length === 0) return null;
  return (
    <section>
      <h2 className="mb-4">More {track.genre}</h2>
      <TrackList tracks={filtered} />
    </section>
  );
}

export function MoreFromGenreSkeleton() {
  return (
    <section>
      <h2 className="mb-4">More</h2>
      <TrackListSkeleton count={3} />
    </section>
  );
}
