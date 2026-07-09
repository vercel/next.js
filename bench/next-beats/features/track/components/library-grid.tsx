import { Collapsible } from '@/components/ui/collapsible';
import { AlbumCard, AlbumCardSkeleton } from '@/features/track/components/album-card';
import { getLibrary } from '@/features/track/track-queries';

const INITIAL_VISIBLE = 20;
const gridClass = 'grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5';

export async function LibraryGrid() {
  const { tracks } = await getLibrary();
  const visible = tracks.slice(0, INITIAL_VISIBLE);
  const overflow = tracks.slice(INITIAL_VISIBLE);

  return (
    <>
      <div className={gridClass}>
        {visible.map(track => (
          <AlbumCard key={track.id} track={track} />
        ))}
      </div>
      {overflow.length > 0 && (
        <Collapsible showMoreLabel={`Show ${overflow.length} more`}>
          <div className={gridClass}>
            {overflow.map(track => (
              <AlbumCard key={track.id} track={track} />
            ))}
          </div>
        </Collapsible>
      )}
    </>
  );
}

export function LibraryGridSkeleton() {
  return (
    <div className={gridClass}>
      {Array.from({ length: 5 }).map((_, i) => (
        <AlbumCardSkeleton key={i} />
      ))}
    </div>
  );
}
