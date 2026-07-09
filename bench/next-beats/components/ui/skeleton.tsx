import { cn } from '@/lib/utils';

type Props = {
  className?: string;
};

export function Skeleton({ className }: Props) {
  return <span aria-hidden className={cn('skeleton-animation block', className)} />;
}
