import { Plus } from 'lucide-react';
import { Suspense } from 'react';
import { Crossfade } from '@/components/ui/crossfade';
import { IconButtonLink, IconButtonLinkSkeleton } from '@/components/ui/icon-button-link';
import { PageWrapper } from '@/components/ui/page-layout';
import { TopGenresGrid } from '@/features/genre/components/genre-browse';
import { PlaylistBrowse } from '@/features/playlist/components/playlist-browse';
import { LibraryGrid, LibraryGridSkeleton } from '@/features/track/components/library-grid';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Library',
};

export const prefetch = 'allow-runtime';

export default function LibraryPage() {
  return (
    <PageWrapper title="Library">
      <h2 className="mb-4">All Tracks</h2>
      <Suspense fallback={<LibraryGridSkeleton />}>
        <Crossfade>
          <div className="mb-10">
            <LibraryGrid />
          </div>
          <section className="mb-10">
            <div className="mb-4 flex items-center gap-2">
              <h2>Your Playlists</h2>
              <Suspense fallback={<IconButtonLinkSkeleton />}>
                <IconButtonLink href="/playlist" label="Create playlist">
                  <Plus className="h-5 w-5" />
                </IconButtonLink>
              </Suspense>
            </div>
            <PlaylistBrowse />
          </section>
          <section>
            <h2 className="mb-4">Genres</h2>
            <TopGenresGrid />
          </section>
        </Crossfade>
      </Suspense>
    </PageWrapper>
  );
}
