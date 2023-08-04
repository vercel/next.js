import type { ReactElement } from 'react'
import DefaultLayout from '@/layouts/default/DefaultLayout'

import { useTranslation } from 'next-i18next'
import { getStaticPaths, makeStaticProps } from '@/lib/getStatic'
import Link from '@/components/routing/Link'

const seo = {
  pathname: '/404',
  title: {
    ja: '404',
    en: '404',
  },
  description: {
    ja: 'ページが見つかりませんでした',
    en: 'Not found',
  },
  img: null,
}

const getStaticProps = makeStaticProps(['common'], seo)
export { getStaticPaths, getStaticProps }

export default function Custom404() {
  const { t } = useTranslation(['common'])
  return (
    <>
      <div className="h-full">
        <div className="grid min-h-screen place-items-center px-6 py-24 sm:py-32 lg:px-8">
          <div className="-translate-y-32 text-center">
            <p className="text-xl font-semibold text-indigo-600 dark:text-indigo-100">
              404
            </p>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-50 sm:text-5xl">
              {t('404title')}
            </h1>
            <p className="mt-6 text-base leading-7 text-gray-600 dark:text-gray-200">
              {t('404body')}
            </p>
            <div className="mt-10 flex items-center justify-center gap-x-6">
              <Link
                href="/"
                className="bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-indigo-400 dark:hover:bg-indigo-600"
              >
                {t('backToTop')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

Custom404.getLayout = function getLayout(page: ReactElement) {
  return <DefaultLayout>{page}</DefaultLayout>
}
