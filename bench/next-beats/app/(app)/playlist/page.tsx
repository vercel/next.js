import { Suspense } from 'react';
import { Crossfade } from '@/components/ui/crossfade';
import { PageWrapper } from '@/components/ui/page-layout';
import { CreatePlaylistForm } from '@/features/playlist/components/create-playlist-form';
import { PlaylistBrowse } from '@/features/playlist/components/playlist-browse';
import { PlaylistListSkeleton } from '@/features/playlist/components/playlist-card';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Playlists',
};

export const prefetch = 'allow-runtime';

export default function PlaylistsPage() {
  return (
    <PageWrapper title="Playlists">
      <div className="mb-6 max-w-md">
        <CreatePlaylistForm />
      </div>
      <Suspense fallback={<PlaylistListSkeleton count={3} />}>
        <Crossfade>
          <PlaylistBrowse animateItems />
        </Crossfade>
      </Suspense>
    </PageWrapper>
  );
}
