import { Suspense } from 'react';
import { Crossfade } from '@/components/ui/crossfade';
import ErrorBoundary from '@/components/ui/error-boundary';
import { PageWrapper } from '@/components/ui/page-layout';
import { MoreFromGenre, MoreFromGenreSkeleton } from '@/features/track/components/more-from-genre';
import { TrackControls, TrackControlsSkeleton } from '@/features/track/components/track-controls';
import { TrackHeader, TrackHeaderSkeleton } from '@/features/track/components/track-header';
import { getTrack } from '@/features/track/track-queries';
import type { Metadata } from 'next';

export async function generateMetadata({ params }: PageProps<'/track/[id]'>): Promise<Metadata> {
  const { id } = await params;
  const track = await getTrack(id);
  return { title: track.title };
}

export const prefetch = 'allow-runtime';

export default function TrackPage({ params }: PageProps<'/track/[id]'>) {
  return (
    <PageWrapper>
      <Suspense
        fallback={
          <>
            <TrackHeaderSkeleton />
            <TrackControlsSkeleton />
          </>
        }
      >
        <Crossfade>
          {params.then(({ id }) => (
            <>
              <TrackHeader id={id} />
              <TrackControls id={id} />
            </>
          ))}
        </Crossfade>
      </Suspense>
      <ErrorBoundary title="Couldn't load similar tracks">
        <Suspense fallback={<MoreFromGenreSkeleton />}>
          <Crossfade>
            {params.then(({ id }) => (
              <MoreFromGenre trackId={id} />
            ))}
          </Crossfade>
        </Suspense>
      </ErrorBoundary>
    </PageWrapper>
  );
}
