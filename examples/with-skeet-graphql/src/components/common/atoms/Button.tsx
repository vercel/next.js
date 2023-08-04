import type { ReactNode } from 'react'
import Link from '@/components/routing/Link'
import clsx from 'clsx'

const baseStyles = {
  solid:
    'group inline-flex items-center justify-center py-2 px-4 font-semibold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 hover:cursor-pointer',
  outline:
    'group inline-flex ring-1 items-center justify-center py-2 px-4 focus:outline-none hover:cursor-pointer',
}

const variantStyles = {
  solid: {
    gray: 'bg-gray-900 text-white dark:bg-gray-50 dark:text-gray-900 dark:hover:bg-gray-300 hover:bg-gray-700 hover:text-gray-50 active:bg-gray-800 active:text-gray-50 focus-visible:outline-gray-900',
    blue: 'bg-blue-600 text-white hover:text-blue-50 hover:bg-blue-500 active:bg-blue-800 active:text-blue-100 focus-visible:outline-blue-600',
    red: 'bg-red-600 text-white hover:text-red-50 hover:bg-red-500 active:bg-red-800 active:text-red-100 focus-visible:outline-red-600',
    green:
      'bg-green-600 text-white hover:text-green-50 hover:bg-green-500 active:bg-green-800 active:text-green-100 focus-visible:outline-green-600',
    yellow:
      'bg-yellow-600 text-white hover:text-yellow-50 hover:bg-yellow-500 active:bg-yellow-800 active:text-yellow-100 focus-visible:outline-yellow-600',
    purple:
      'bg-purple-600 text-white hover:text-purple-50 hover:bg-purple-500 active:bg-purple-800 active:text-purple-100 focus-visible:outline-purple-600',
    orange:
      'bg-orange-600 text-white hover:text-orange-50 hover:bg-orange-500 active:bg-orange-800 active:text-orange-100 focus-visible:outline-orange-600',
    amber:
      'bg-amber-600 text-white hover:text-amber-50 hover:bg-amber-500 active:bg-amber-800 active:text-amber-100 focus-visible:outline-amber-600',
    pink: 'bg-pink-600 text-white hover:text-pink-50 hover:bg-pink-500 active:bg-pink-800 active:text-pink-100 focus-visible:outline-pink-600',
    indigo:
      'bg-indigo-600 text-white hover:text-indigo-50 hover:bg-indigo-500 active:bg-indigo-800 active:text-indigo-100 focus-visible:outline-indigo-600',

    white:
      'bg-white text-gray-900 hover:bg-blue-50 active:bg-blue-200 active:text-blue-700 focus-visible:outline-white',
    black:
      'bg-gray-900 text-white hover:bg-gray-500 active:bg-gray-700 active:text-bg-gray-100 focus-visible:outline-white',
  },
  outline: {
    gray: 'ring-gray-200 text-gray-700 dark:text-gray-100 dark:ring-gray-100 dark:hover:text-gray-50 dark:hover:ring-gray-50 hover:text-gray-900 hover:ring-gray-400 active:bg-gray-100 dark:active:bg-gray-500 active:text-gray-700 focus-visible:outline-blue-600 focus-visible:ring-gray-300',
    blue: 'ring-blue-200 text-blue-700 dark:text-blue-200 hover:text-blue-500 hover:ring-blue-400 dark:hover:ring-blue-100 dark:hover:text-blue-100 active:bg-blue-100 active:text-blue-700 dark:active:bg-blue-400 focus-visible:outline-blue-600 focus-visible:ring-blue-300',
    red: 'ring-red-200 text-red-700 dark:text-red-200 hover:text-red-500 hover:ring-red-400 dark:hover:ring-red-100 dark:hover:text-red-100 active:bg-red-100 active:text-red-700 dark:active:bg-red-400 focus-visible:outline-red-600 focus-visible:ring-red-300',
    green:
      'ring-green-200 text-green-700 dark:text-green-200 hover:text-green-500 hover:ring-green-400 dark:hover:ring-green-100 dark:hover:text-green-100 active:bg-green-100 active:text-green-700 dark:active:bg-green-400 focus-visible:outline-green-600 focus-visible:ring-green-300',
    yellow:
      'ring-yellow-200 text-yellow-700 dark:text-yellow-200 hover:text-yellow-500 hover:ring-yellow-400 dark:hover:ring-yellow-100 dark:hover:text-yellow-100 active:bg-yellow-100 active:text-yellow-700 dark:active:bg-yellow-400 focus-visible:outline-yellow-600 focus-visible:ring-yellow-300',
    purple:
      'ring-purple-200 text-purple-700 dark:text-purple-200 hover:text-purple-500 hover:ring-purple-400 dark:hover:ring-purple-100 dark:hover:text-purple-100 active:bg-purple-100 active:text-purple-700 dark:active:bg-purple-400 focus-visible:outline-purple-600 focus-visible:ring-purple-300',
    orange:
      'ring-orange-200 text-orange-700 dark:text-orange-200 hover:text-orange-500 hover:ring-orange-400 dark:hover:ring-orange-100 dark:hover:text-orange-100 active:bg-orange-100 active:text-orange-700 dark:active:bg-orange-400 focus-visible:outline-orange-600 focus-visible:ring-orange-300',
    amber:
      'ring-amber-200 text-amber-700 dark:text-amber-200 hover:text-amber-500 hover:ring-amber-400 dark:hover:ring-amber-100 dark:hover:text-amber-100 active:bg-amber-100 active:text-amber-700 dark:active:bg-amber-400 focus-visible:outline-amber-600 focus-visible:ring-amber-300',
    pink: 'ring-pink-200 text-pink-700 dark:text-pink-200 hover:text-pink-500 hover:ring-pink-400 dark:hover:ring-pink-100 dark:hover:text-pink-100 active:bg-pink-100 active:text-pink-700 dark:active:bg-pink-400 focus-visible:outline-pink-600 focus-visible:ring-pink-300',
    indigo:
      'ring-indigo-200 text-indigo-700 dark:text-indigo-200 hover:text-indigo-500 hover:ring-indigo-400 dark:hover:ring-indigo-100 dark:hover:text-indigo-100 active:bg-indigo-100 active:text-indigo-700 dark:active:bg-indigo-400 focus-visible:outline-indigo-600 focus-visible:ring-indigo-300',
    white:
      'ring-gray-200 text-white hover:ring-gray-500 hover:text-gray-100 active:ring-gray-700 active:text-gray-400 focus-visible:outline-white',
    black:
      'ring-gray-900 text-gray-900 hover:ring-gray-500 hover:text-gray-500 active:ring-gray-700 active:text-gray-700 focus-visible:outline-white',
  },
}

type Props = {
  children: ReactNode | string
  variant?: 'solid' | 'outline'
  color?:
    | 'gray'
    | 'blue'
    | 'red'
    | 'green'
    | 'yellow'
    | 'purple'
    | 'orange'
    | 'amber'
    | 'pink'
    | 'indigo'
    | 'white'
    | 'black'
  className?: string
  href?: string
  target?: string
  rel?: string
  onClick?: () => void
  type?: 'submit' | 'reset' | 'button'
  disabled?: boolean
}

export default function Button({
  variant = 'solid',
  color = 'gray',
  className,
  href,
  children,
  ...props
}: Props) {
  className = clsx(
    baseStyles[variant],
    variantStyles[variant][color],
    className
  )

  return href ? (
    href.includes('https://') ? (
      <a href={href} className={className} {...props}>
        {children}
      </a>
    ) : (
      <Link href={href} className={className} {...props}>
        {children}
      </Link>
    )
  ) : (
    <button className={className} {...props}>
      {children}
    </button>
  )
}
