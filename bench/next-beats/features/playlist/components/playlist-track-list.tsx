import { ViewTransition } from 'react';
import { RemoveFromPlaylistButton } from '@/features/playlist/components/playlist-interactions';
import { TrackRow } from '@/features/track/components/track-row';
import type { Track } from '@/types/track';

export function PlaylistTrackList({ playlistId, tracks }: { playlistId: string; tracks: Track[] }) {
  return (
    <div className="flex flex-col gap-0.5">
      {tracks.map((track, i) => (
        <ViewTransition key={track.id}>
          <div className="flex items-center transition-opacity has-data-pending:opacity-30">
            <div className="min-w-0 flex-1">
              <TrackRow track={track} index={i} queue={tracks} />
            </div>
            <RemoveFromPlaylistButton playlistId={playlistId} trackId={track.id} />
          </div>
        </ViewTransition>
      ))}
    </div>
  );
}
