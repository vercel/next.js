import { EmptyState } from '@/components/ui/empty-state';
import { PlaylistList } from '@/features/playlist/components/playlist-card';
import { searchPlaylists } from '@/features/playlist/playlist-queries';
import { TrackList } from '@/features/track/components/track-row';
import { searchTracks } from '@/features/track/track-queries';

export async function SearchResults({ query }: { query: string }) {
  const [tracks, playlists] = await Promise.all([searchTracks(query), searchPlaylists(query)]);

  if (tracks.length === 0 && playlists.length === 0) {
    return <EmptyState title="No results" body={`No tracks or playlists match "${query}".`} />;
  }

  return (
    <div className="flex flex-col gap-10">
      {tracks.length > 0 && (
        <section>
          <h2 className="mb-4">Tracks</h2>
          <TrackList tracks={tracks} />
        </section>
      )}
      {playlists.length > 0 && (
        <section>
          <h2 className="mb-4">Playlists</h2>
          <PlaylistList playlists={playlists} />
        </section>
      )}
    </div>
  );
}
