import { Suspense } from 'react';
import { Crossfade } from '@/components/ui/crossfade';
import ErrorBoundary from '@/components/ui/error-boundary';
import { PageWrapper } from '@/components/ui/page-layout';
import { GenreBrowse, GenreBrowseSkeleton } from '@/features/genre/components/genre-browse';
import { SearchResults } from '@/features/track/components/search-results';
import { SearchShell } from '@/features/track/components/search-shell';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Search',
};

export const prefetch = 'allow-runtime';

export default function SearchPage({ searchParams }: PageProps<'/search'>) {
  return (
    <PageWrapper title="Search">
      <SearchShell>
        <ErrorBoundary title="Search is taking a breather">
          <Suspense fallback={<GenreBrowseSkeleton />}>
            <Crossfade>
              {searchParams.then(sp => {
                const q = typeof sp.q === 'string' ? sp.q : '';
                if (!q) {
                  return (
                    <>
                      <h2 className="mb-4">Browse All</h2>
                      <GenreBrowse />
                    </>
                  );
                }
                return <SearchResults query={q} />;
              })}
            </Crossfade>
          </Suspense>
        </ErrorBoundary>
      </SearchShell>
    </PageWrapper>
  );
}
