import { ChevronDownIcon } from '../../icons/chevron-down'

export function Select({
  children,
  prefix,
  ...props
}: {
  prefix?: React.ReactNode
} & Omit<React.HTMLProps<HTMLSelectElement>, 'prefix'>) {
  return (
    <div data-nextjs-select>
      {prefix}
      <select {...props}>{children}</select>
      <ChevronDownIcon width={16} height={16} />
    </div>
  )
}
