import { EmptyState } from '@/components/ui/empty-state';
import { PlaylistList } from '@/features/playlist/components/playlist-card';
import { getPlaylists } from '@/features/playlist/playlist-queries';

export async function PlaylistBrowse({ excludeId, animateItems }: { excludeId?: string; animateItems?: boolean } = {}) {
  const playlists = await getPlaylists();
  const filtered = excludeId ? playlists.filter(p => p.id !== excludeId) : playlists;
  if (filtered.length === 0) {
    if (excludeId) return null;
    return <EmptyState title="No playlists" body="Create your first playlist." />;
  }
  return <PlaylistList playlists={filtered} animateItems={animateItems} />;
}
