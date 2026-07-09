export function Collapsible({
  showMoreLabel,
  showLessLabel = 'Show less',
  children,
}: {
  showMoreLabel: string;
  showLessLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <details className="flex flex-col [&_summary_.label-less]:hidden [&[open]_summary_.label-less]:inline [&[open]_summary_.label-more]:hidden">
      <div className="order-1 mt-0.5 flex flex-col gap-0.5 motion-safe:animate-[fade_220ms_ease-out]">{children}</div>
      <summary className="text-muted hover:text-accent order-2 mt-3 cursor-pointer list-none text-sm font-medium transition-colors">
        <span className="label-more">{showMoreLabel}</span>
        <span className="label-less">{showLessLabel}</span>
      </summary>
    </details>
  );
}
