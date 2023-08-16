import clsx from 'clsx'

export default function Button({
  kind = 'default',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  kind?: 'default' | 'error'
}) {
  return (
    <button
      className={clsx('rounded-lg px-3 py-1 text-sm font-medium', {
        'bg-gray-700 text-gray-100 hover:bg-gray-500 hover:text-white':
          kind === 'default',
        'bg-vercel-pink text-red-50 hover:bg-pink-600 hover:text-white':
          kind === 'error',
      })}
      {...props}
    />
  )
}
