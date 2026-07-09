import { Suspense } from 'react';
import { Crossfade } from '@/components/ui/crossfade';
import ErrorBoundary from '@/components/ui/error-boundary';
import { PageWrapper } from '@/components/ui/page-layout';
import { GenreBrowse, GenreBrowseSkeleton } from '@/features/genre/components/genre-browse';
import { SearchInput } from '@/features/track/components/search-input';
import { SearchResults } from '@/features/track/components/search-results';
import { TrackListSkeleton } from '@/features/track/components/track-row';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Search',
};

export const prefetch = 'allow-runtime';

export default function SearchPage({ searchParams }: PageProps<'/search'>) {
  return (
    <PageWrapper title="Search">
      <div className="mb-8">
        <SearchInput />
      </div>
      <h2 className="mb-4">Browse All</h2>
      <ErrorBoundary title="Search is taking a breather">
        <Suspense fallback={<GenreBrowseSkeleton />}>
          <Crossfade>
            {searchParams.then(sp => {
              const q = typeof sp.q === 'string' ? sp.q : '';
              if (!q) {
                return <GenreBrowse />;
              }
              return (
                <Suspense fallback={<TrackListSkeleton count={5} />}>
                  <SearchResults query={q} />
                </Suspense>
              );
            })}
          </Crossfade>
        </Suspense>
      </ErrorBoundary>
    </PageWrapper>
  );
}
