import { Music } from 'lucide-react';

type Props = {
  title: string;
  body?: string;
  children?: React.ReactNode;
};

export function EmptyState({ title, body, children }: Props) {
  return (
    <div className="border-divider/70 dark:border-divider-dark/70 flex flex-col items-center gap-3 border-b px-5 py-16 text-center">
      <Music size={32} className="text-divider dark:text-divider-dark" />
      <p className="text-sm font-medium text-black dark:text-white">{title}</p>
      {body ? <p className="text-gray max-w-xs text-sm">{body}</p> : null}
      {children}
    </div>
  );
}
