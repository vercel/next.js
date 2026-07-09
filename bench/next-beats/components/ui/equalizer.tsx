import { cn } from '@/lib/utils';

export function Equalizer({ size = 'sm', color = 'bg-accent' }: { size?: 'sm' | 'md' | 'lg'; color?: string }) {
  const barClass = size === 'lg' ? 'w-1.5' : size === 'md' ? 'w-1' : 'w-0.75';
  const gapClass = size === 'lg' ? 'gap-1' : size === 'md' ? 'gap-[3px]' : 'gap-0.5';
  return (
    <span className={cn('flex items-end', gapClass)}>
      <span className={cn('inline-block animate-[eq1_0.8s_ease-in-out_infinite] rounded-sm', color, barClass)} />
      <span className={cn('inline-block animate-[eq2_0.6s_ease-in-out_infinite_0.2s] rounded-sm', color, barClass)} />
      <span className={cn('inline-block animate-[eq3_0.7s_ease-in-out_infinite_0.1s] rounded-sm', color, barClass)} />
    </span>
  );
}
