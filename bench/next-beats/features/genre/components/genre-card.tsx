'use client';

import Link from 'next/link';
import { usePrefetchDefault } from '@/components/demo/prefetch-provider';
import { Skeleton } from '@/components/ui/skeleton';
import type { GenreSummary } from '@/types/genre';

const genreColors: Record<string, string> = {
  electronic: 'from-pink-400/80 to-rose-500/80',
  'hip-hop': 'from-rose-300/80 to-pink-400/80',
  indie: 'from-pink-300/80 to-rose-400/80',
  'lo-fi': 'from-rose-400/80 to-pink-600/80',
  pop: 'from-pink-200/80 to-rose-300/80',
  synthwave: 'from-rose-500/80 to-pink-700/80',
};

export function GenrePill({ genre }: { genre: string }) {
  const prefetch = usePrefetchDefault();
  return (
    <Link
      href={`/genre/${genre}`}
      prefetch={prefetch}
      className="bg-accent/10 text-accent hover:bg-accent/20 rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors"
    >
      {genre}
    </Link>
  );
}

export function GenreCard({ genre }: { genre: GenreSummary }) {
  const prefetch = usePrefetchDefault();
  const gradient = genreColors[genre.genre] ?? 'from-gray-500 to-gray-700';
  return (
    <Link
      href={`/genre/${genre.genre}`}
      prefetch={prefetch}
      className="group relative overflow-hidden rounded-lg transition-transform hover:scale-[1.02]"
    >
      <div className={`flex h-28 items-end bg-gradient-to-br p-4 ${gradient}`}>
        <div>
          <span className="text-lg font-bold text-white capitalize drop-shadow-md">{genre.genre}</span>
          <p className="text-xs text-white/70">{genre.count} tracks</p>
        </div>
      </div>
    </Link>
  );
}

export function GenreGrid({ genres }: { genres: GenreSummary[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {genres.map(g => (
        <GenreCard key={g.genre} genre={g} />
      ))}
    </div>
  );
}

export function GenreGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="skeleton-subtle h-28 rounded-lg" />
      ))}
    </div>
  );
}
