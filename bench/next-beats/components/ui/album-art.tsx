import { cn } from '@/lib/utils';

type Props = {
  coverColor: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const sizeMap = {
  lg: 'h-24 w-24',
  md: 'h-12 w-12',
  sm: 'h-10 w-10',
};

export function AlbumArt({ coverColor, size = 'md', className }: Props) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-md bg-gradient-to-br',
        coverColor,
        sizeMap[size],
        className,
      )}
    >
      <svg
        className="h-1/3 w-1/3 text-white/60"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    </div>
  );
}

export function AlbumArtSkeleton({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return <span aria-hidden className={cn('skeleton-animation block rounded-md', sizeMap[size])} />;
}
