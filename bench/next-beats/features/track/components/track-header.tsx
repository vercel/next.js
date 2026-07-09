import { ViewTransition } from 'react';
import { AlbumArt } from '@/components/ui/album-art';
import { Skeleton } from '@/components/ui/skeleton';
import { GenrePill } from '@/features/genre/components/genre-card';
import { getTrack } from '@/features/track/track-queries';
import { formatDuration, formatCount } from '@/lib/utils';

export async function TrackHeader({ id }: { id: string }) {
  const track = await getTrack(id);

  return (
    <div className="mb-8 flex flex-col items-center gap-4 sm:flex-row sm:items-end sm:gap-6">
      <ViewTransition name={`track-art-${track.id}`} default="none">
        <AlbumArt
          coverColor={track.coverColor}
          size="lg"
          className="!h-40 !w-40 shrink-0 !rounded-md shadow-2xl lg:!h-48 lg:!w-48"
        />
      </ViewTransition>
      <div className="flex min-w-0 flex-col items-center gap-1 text-center sm:items-start sm:text-left">
        <span className="text-muted text-xs font-bold tracking-widest uppercase">Track</span>
        <h1 className="text-2xl font-black tracking-tight text-black sm:text-3xl lg:text-4xl dark:text-white">
          {track.title}
        </h1>
        <p className="text-muted text-xs sm:text-sm">
          {track.artist} · {track.album} · {formatDuration(track.duration)} · {formatCount(track.playCount)} plays
        </p>
        <div className="mt-1">
          <GenrePill genre={track.genre} />
        </div>
      </div>
    </div>
  );
}

export function TrackHeaderSkeleton() {
  return (
    <div className="mb-8 flex flex-col items-center gap-4 sm:flex-row sm:items-end sm:gap-6">
      <Skeleton className="skeleton-subtle h-40 w-40 shrink-0 rounded-md shadow-2xl lg:h-48 lg:w-48" />
      <div className="flex min-w-0 flex-1 flex-col items-center gap-1 sm:items-start">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-8 w-52 sm:h-9 sm:w-60" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-1 h-6 w-16 rounded-full" />
      </div>
    </div>
  );
}
