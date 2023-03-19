import clsx from 'clsx';

export default function Button({
  kind = 'default',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  kind?: 'default' | 'error';
}) {
  return (
    <button
      className={clsx('rounded-lg  px-3 py-1 text-sm font-medium', {
        'bg-zinc-700 text-zinc-100 hover:bg-zinc-500 hover:text-white':
          kind === 'default',
        'bg-red-600 text-red-50 hover:bg-red-500 hover:text-white':
          kind === 'error',
      })}
      {...props}
    />
  );
}
