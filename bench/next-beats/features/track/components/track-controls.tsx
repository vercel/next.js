import { Skeleton } from '@/components/ui/skeleton';
import { AddToPlaylistMenu } from '@/features/playlist/components/add-to-playlist-menu';
import { getPlaylistMenuItems } from '@/features/playlist/playlist-queries';
import { PlayButton } from '@/features/track/components/play-button';
import { FavoriteButton } from '@/features/track/components/track-interactions';
import { getTrack } from '@/features/track/track-queries';

export async function TrackControls({ id }: { id: string }) {
  const track = await getTrack(id);

  return (
    <div className="mb-8 flex items-center gap-4">
      <PlayButton track={track} className="!h-14 !w-14 [&_svg]:!h-6 [&_svg]:!w-6" />
      <FavoriteButton trackId={track.id} isFavorite={track.isFavorite} size="lg" />
      <AddToPlaylistMenu trackId={track.id} itemsPromise={getPlaylistMenuItems(track.id)} size="lg" />
    </div>
  );
}

export function TrackControlsSkeleton() {
  return (
    <div className="mb-8 flex items-center gap-4">
      <Skeleton className="h-14 w-14 shrink-0 rounded-full" />
      <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
      <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
    </div>
  );
}
