import { ViewTransition } from 'react';
import { AlbumArt } from '@/components/ui/album-art';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { DeletePlaylistButton } from '@/features/playlist/components/playlist-interactions';
import { PlaylistTrackList } from '@/features/playlist/components/playlist-track-list';
import { getPlaylist } from '@/features/playlist/playlist-queries';
import { PlayButton } from '@/features/track/components/play-button';
import { TrackListSkeleton } from '@/features/track/components/track-row';

export async function PlaylistDetail({ id }: { id: string }) {
  const playlist = await getPlaylist(id);
  return (
    <>
      <div className="mb-8 flex flex-col items-center gap-4 sm:flex-row sm:items-end sm:gap-6">
        <ViewTransition name={`playlist-art-${id}`} default="none">
          <AlbumArt
            coverColor={playlist.coverColor}
            size="lg"
            className="!h-40 !w-40 !rounded-md shadow-2xl sm:!h-48 sm:!w-48"
          />
        </ViewTransition>
        <div className="flex flex-col items-center gap-1 text-center sm:items-start sm:text-left">
          <span className="text-muted text-xs font-bold tracking-widest uppercase">Playlist</span>
          <h1 className="text-2xl font-black tracking-tight text-black sm:text-4xl dark:text-white">{playlist.name}</h1>
          {playlist.description ? <p className="text-muted text-xs sm:text-sm">{playlist.description}</p> : null}
          <p className="text-muted text-xs">{playlist.trackCount} tracks</p>
        </div>
      </div>
      <div className="mb-6 flex items-center gap-4">
        {playlist.tracks.length > 0 ? (
          <PlayButton
            track={playlist.tracks[0]}
            queue={playlist.tracks}
            className="!h-14 !w-14 [&_svg]:!h-6 [&_svg]:!w-6"
          />
        ) : null}
        <DeletePlaylistButton playlistId={id} size="lg" />
      </div>
      {playlist.tracks.length === 0 ? (
        <EmptyState title="Empty playlist" body="Add some tracks to get started." />
      ) : (
        <PlaylistTrackList playlistId={id} tracks={playlist.tracks} />
      )}
    </>
  );
}

export function PlaylistDetailSkeleton() {
  return (
    <>
      <div className="mb-8 flex flex-col items-center gap-4 sm:flex-row sm:items-end sm:gap-6">
        <Skeleton className="skeleton-subtle h-40 w-40 shrink-0 rounded-md shadow-2xl sm:h-48 sm:w-48" />
        <div className="flex flex-col items-center gap-1 sm:items-start">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-9 w-44 sm:h-11 sm:w-52" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3.5 w-28" />
        </div>
      </div>
      <div className="mb-6 flex items-center gap-4">
        <Skeleton className="h-14 w-14 shrink-0 rounded-full" />
        <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
      </div>
      <TrackListSkeleton count={4} showIndex />
    </>
  );
}
