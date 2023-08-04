import { useTranslation } from 'next-i18next'
import Link from '@/components/routing/Link'
import type { DocIndex } from '@/types/article'
import {
  HeartIcon,
  RocketLaunchIcon,
  ArrowUpRightIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'

const actions = [
  {
    title: 'doc:actions.motivation.title',
    body: 'doc:actions.motivation.body',
    href: '/doc/general/motivation',
    icon: HeartIcon,
    iconForeground: 'text-pink-700',
    iconBackground: 'bg-pink-50',
  },
  {
    title: 'doc:actions.quickstart.title',
    body: 'doc:actions.quickstart.body',
    href: '/doc/general/quickstart',
    icon: RocketLaunchIcon,
    iconForeground: 'text-green-700',
    iconBackground: 'bg-green-50',
  },
]

export default function DocIndex() {
  const { t } = useTranslation()

  return (
    <>
      <div className="py-24">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-50 sm:text-4xl">
              {t('doc:title')}
            </h2>
            <p className="mt-2 text-lg leading-8 text-gray-600 dark:text-gray-300">
              {t('doc:body')}
            </p>
          </div>
        </div>
        <div className="py-12">
          <div className="divide-y divide-gray-200 overflow-hidden bg-gray-200 shadow sm:grid sm:grid-cols-2 sm:gap-px sm:divide-y-0">
            {actions.map((action, actionIdx) => (
              <div
                key={action.title}
                className={clsx(
                  actionIdx === 0 ? '' : '',
                  actionIdx === 1 ? '' : '',
                  actionIdx === actions.length - 2 ? '' : '',
                  actionIdx === actions.length - 1 ? '' : '',
                  'group relative bg-gray-50 p-6 focus-within:ring-2 focus-within:ring-inset focus-within:ring-gray-500 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700'
                )}
              >
                <div>
                  <span
                    className={clsx(
                      action.iconBackground,
                      action.iconForeground,
                      'inline-flex p-3 ring-4 ring-white'
                    )}
                  >
                    <action.icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                </div>
                <div className="mt-8">
                  <h3 className="text-lg font-medium">
                    <Link href={action.href} className="focus:outline-none">
                      <span className="absolute inset-0" aria-hidden="true" />
                      {t(action.title)}
                    </Link>
                  </h3>
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-200">
                    {t(action.body)}
                  </p>
                </div>
                <span
                  className="pointer-events-none absolute right-6 top-6 text-gray-300 group-hover:text-gray-400"
                  aria-hidden="true"
                >
                  <ArrowUpRightIcon className="h-6 w-6" />
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
