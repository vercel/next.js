import { useTheme } from 'next-themes'
import { MoonIcon, SunIcon } from '@heroicons/react/20/solid'

export default function ColorModeChanger() {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <>
      <button
        onClick={() => {
          resolvedTheme === 'light' ? setTheme('dark') : setTheme('light')
        }}
        className="group inline-flex items-center p-1 text-base font-medium text-gray-700 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 dark:text-gray-50"
      >
        <MoonIcon
          className="h-5 w-5 text-gray-700 hover:text-gray-900 dark:hidden"
          aria-hidden="true"
        />
        <SunIcon
          className="hidden h-5 w-5 dark:block dark:text-gray-50 hover:dark:text-gray-200"
          aria-hidden="true"
        />
      </button>
    </>
  )
}
