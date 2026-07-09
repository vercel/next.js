import { EmptyState } from '@/components/ui/empty-state';
import { TrackList } from '@/features/track/components/track-row';
import { getTracksByGenre } from '@/features/track/track-queries';

export async function GenreTracks({ genre }: { genre: string }) {
  const tracks = await getTracksByGenre(genre);
  if (tracks.length === 0) {
    return <EmptyState title="No tracks" body={`No tracks in ${genre} yet.`} />;
  }
  return <TrackList tracks={tracks} showIndex collapseAfter={5} />;
}
