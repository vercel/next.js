import clsx from 'clsx';

export const SkeletonCard = ({ isLoading }: { isLoading?: boolean }) => (
  <div
    className={clsx('rounded-2xl bg-zinc-900/80 p-4', {
      'relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent':
        isLoading,
    })}
  >
    <div className="space-y-3">
      <div className="h-14 rounded-lg bg-zinc-700" />
      <div className="h-3 w-11/12 rounded-lg bg-zinc-700" />
      <div className="h-3 w-8/12 rounded-lg bg-zinc-700" />
    </div>
  </div>
);
