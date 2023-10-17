import Link from 'next/link'

export function A({ children, className = '', href, ...props }) {
  return (
    <Link
      href={href}
      className={`border-b text-gray-600 border-gray-300 transition-[border-color] hover:border-gray-600 dark:text-white dark:border-gray-500 dark:hover:border-white ${className}`}
      {...props}
    >
      {children}
    </Link>
  )
}
