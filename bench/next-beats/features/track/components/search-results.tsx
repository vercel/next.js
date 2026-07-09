import { EmptyState } from '@/components/ui/empty-state';
import { TrackList } from '@/features/track/components/track-row';
import { searchTracks } from '@/features/track/track-queries';

export async function SearchResults({ query }: { query: string }) {
  const tracks = await searchTracks(query);

  if (tracks.length === 0) {
    return <EmptyState title="No results" body={`No tracks match "${query}".`} />;
  }

  return <TrackList tracks={tracks} />;
}
