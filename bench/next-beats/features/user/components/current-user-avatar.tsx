import { Skeleton } from '@/components/ui/skeleton';
import { getCurrentUserName } from '@/features/user/user-queries';
import { cn } from '@/lib/utils';

type Size = 'sm' | 'md';

const sizes: Record<Size, string> = {
  md: 'h-8 w-8 text-xs',
  sm: 'h-6 w-6 text-[10px]',
};

export async function CurrentUserAvatar({ size = 'md', className }: { size?: Size; className?: string }) {
  const name = await getCurrentUserName();
  return (
    <div
      aria-hidden
      className={cn(
        'bg-accent flex items-center justify-center rounded-full font-semibold text-white uppercase',
        sizes[size],
        className,
      )}
    >
      {name.charAt(0)}
    </div>
  );
}

export function CurrentUserAvatarSkeleton({ size = 'md', className }: { size?: Size; className?: string }) {
  return <Skeleton className={cn('rounded-full', sizes[size], className)} />;
}
