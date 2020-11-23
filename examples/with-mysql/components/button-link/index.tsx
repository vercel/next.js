import Link from 'next/link'
import cn from 'clsx'

function ButtonLink({ href = '/', className = '', children }) {
  return (
    <Link href={href}>
      <a
        className={cn(
          'bg-black',
          'text-white',
          'p-2',
          'rounded',
          'uppercase',
          'text-sm',
          'font-bold',
          {
            [className]: Boolean(className),
          }
        )}
      >
        {children}
      </a>
    </Link>
  )
}

export default ButtonLink
