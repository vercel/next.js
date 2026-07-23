import { Skeleton } from '@/components/ui/skeleton';
import { GenreCard, GenreGrid, GenreGridSkeleton } from '@/features/genre/components/genre-card';
import { getGenres } from '@/features/genre/genre-queries';

export async function GenreBrowse() {
  const genres = await getGenres();
  return <GenreGrid genres={genres} />;
}

export { GenreGridSkeleton as GenreBrowseSkeleton } from '@/features/genre/components/genre-card';

export async function TopGenresGrid() {
  const genres = (await getGenres()).slice(0, 6);
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {genres.map(g => (
        <GenreCard key={g.genre} genre={g} />
      ))}
    </div>
  );
}

export function TopGenresGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="skeleton-subtle h-28 rounded-lg" />
      ))}
    </div>
  );
}
