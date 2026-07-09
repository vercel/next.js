import { AlbumArt } from '@/components/ui/album-art';
import { Collapsible } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { AddToPlaylistMenu } from '@/features/playlist/components/add-to-playlist-menu';
import { getPlaylistMenuItems } from '@/features/playlist/playlist-queries';
import { FavoriteButton, NowPlayingTrackLink, TrackIndexCell } from '@/features/track/components/track-interactions';
import { TrackPlayRow } from '@/features/track/components/track-interactions';
import { getUserFavoriteIds } from '@/features/track/track-queries';
import { formatDuration, formatCount } from '@/lib/utils';
import type { Track as TrackT } from '@/types/track';

type Props = {
  track: TrackT;
  index?: number;
  showAlbum?: boolean;
};

export async function TrackRow({ track, index, showAlbum = true, queue }: Props & { queue?: TrackT[] }) {
  const favoriteIds = await getUserFavoriteIds();
  const isFavorite = track.isFavorite || favoriteIds.has(track.id);
  return (
    <TrackPlayRow track={track} queue={queue}>
      <div className="flex items-center gap-3 px-3 py-2">
        <TrackIndexCell trackId={track.id} index={index} />
        <AlbumArt coverColor={track.coverColor} size="sm" />
        <div className="flex min-w-0 flex-1 flex-col">
          <NowPlayingTrackLink trackId={track.id} href={`/track/${track.id}`}>
            {track.title}
          </NowPlayingTrackLink>
          <span className="text-muted truncate text-xs">
            {track.artist}
            {showAlbum ? ` · ${track.album}` : ''}
          </span>
        </div>
        <span className="text-muted hidden text-xs sm:block">{formatCount(track.playCount)} plays</span>
        <span className="text-muted font-mono text-xs">{formatDuration(track.duration)}</span>
        <FavoriteButton trackId={track.id} isFavorite={isFavorite} />
        <AddToPlaylistMenu trackId={track.id} itemsPromise={getPlaylistMenuItems(track.id)} />
      </div>
    </TrackPlayRow>
  );
}

export function TrackList({
  tracks,
  showIndex = false,
  collapseAfter,
}: {
  tracks: TrackT[];
  showIndex?: boolean;
  collapseAfter?: number;
}) {
  const shouldCollapse = collapseAfter !== undefined && tracks.length > collapseAfter;
  const visible = shouldCollapse ? tracks.slice(0, collapseAfter) : tracks;
  const overflow = shouldCollapse ? tracks.slice(collapseAfter) : [];

  return (
    <>
      <div className="flex flex-col gap-0.5">
        {visible.map((track, i) => (
          <TrackRow key={track.id} track={track} index={showIndex ? i : undefined} queue={tracks} />
        ))}
      </div>
      {overflow.length > 0 && (
        <Collapsible showMoreLabel={`Show ${overflow.length} more`}>
          {overflow.map((track, i) => (
            <TrackRow key={track.id} track={track} index={showIndex ? visible.length + i : undefined} queue={tracks} />
          ))}
        </Collapsible>
      )}
    </>
  );
}

export function TrackRowSkeleton({ showIndex = false, index }: { showIndex?: boolean; index?: number }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      {showIndex ? (
        <span className="text-muted w-5 text-right font-mono text-xs">{(index ?? 0) + 1}</span>
      ) : (
        <span className="w-5" />
      )}
      <Skeleton className="h-10 w-10 shrink-0 rounded-md" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="h-3 w-20" />
      </div>
      <Skeleton className="hidden h-3 w-14 sm:block" />
      <Skeleton className="h-3 w-8" />
      <span className="p-1.5">
        <Skeleton className="h-4 w-4 rounded-full" />
      </span>
      <span className="p-1.5">
        <Skeleton className="h-4 w-4 rounded-full" />
      </span>
    </div>
  );
}

export function TrackListSkeleton({
  count = 5,
  showIndex = false,
  showMore = false,
}: {
  count?: number;
  showIndex?: boolean;
  showMore?: boolean;
}) {
  return (
    <>
      <div className="flex flex-col gap-0.5">
        {Array.from({ length: count }).map((_, i) => (
          <TrackRowSkeleton key={i} showIndex={showIndex} index={i} />
        ))}
      </div>
      {showMore && <Skeleton className="skeleton-subtle mt-3 h-5 w-24" />}
    </>
  );
}
