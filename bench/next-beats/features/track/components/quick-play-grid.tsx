import { Music } from 'lucide-react';
import { ViewTransition } from 'react';
import { AlbumArt } from '@/components/ui/album-art';
import { Skeleton } from '@/components/ui/skeleton';
import { TrackPlayRow, NowPlayingTrackLink, TrackIndexCell } from '@/features/track/components/track-interactions';
import { getRecentlyPlayed } from '@/features/track/track-queries';

const SLOTS = 6;

export async function QuickPlayGrid() {
  const tracks = await getRecentlyPlayed(SLOTS);
  const fillers = SLOTS - tracks.length;

  return (
    <div className="relative grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {tracks.map(track => (
        <ViewTransition key={track.id}>
          <TrackPlayRow track={track}>
            <div className="bg-card/60 hover:bg-card dark:bg-card-dark/60 dark:hover:bg-card-dark group/quick flex items-center gap-3 rounded-md px-3 py-2 transition-colors">
              <TrackIndexCell trackId={track.id} />
              <AlbumArt coverColor={track.coverColor} size="sm" className="!h-10 !w-10 !rounded-md" />
              <div className="flex min-w-0 flex-1 flex-col">
                <NowPlayingTrackLink trackId={track.id} href={`/track/${track.id}`}>
                  {track.title}
                </NowPlayingTrackLink>
                <span className="text-muted truncate text-xs">{track.artist}</span>
              </div>
            </div>
          </TrackPlayRow>
        </ViewTransition>
      ))}
      {Array.from({ length: fillers }).map((_, i) => (
        <div key={`filler-${i}`} aria-hidden className="flex items-center gap-3 rounded-md px-3 py-2 opacity-0">
          <span className="w-5" />
          <span className="h-10 w-10 shrink-0 rounded-md" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="h-4 w-24" />
            <span className="h-3 w-16" />
          </div>
        </div>
      ))}
      {tracks.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
          <Music size={32} className="text-divider dark:text-divider-dark" />
          <p className="text-sm font-medium text-black dark:text-white">Nothing played yet</p>
          <p className="text-gray max-w-xs text-sm">Play a track and it&apos;ll show up here.</p>
        </div>
      )}
    </div>
  );
}

export function QuickPlayGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: SLOTS }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-md px-3 py-2">
          <span className="w-5" />
          <Skeleton className="h-10 w-10 shrink-0 rounded-md" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Skeleton className="h-4 w-24 rounded" />
            <Skeleton className="h-3 w-16 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
