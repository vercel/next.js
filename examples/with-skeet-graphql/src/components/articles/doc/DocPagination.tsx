import { useTranslation } from 'next-i18next'
import Link from '@/components/routing/Link'
import { useMemo } from 'react'
import { docMenuNav } from '@/config/navs'
import { useRouter } from 'next/router'
import {
  ArrowSmallLeftIcon,
  ArrowSmallRightIcon,
} from '@heroicons/react/24/outline'

export default function DocPagination() {
  const { t } = useTranslation()
  const router = useRouter()
  const asPathWithoutLang = useMemo(() => {
    return router.asPath.replace('/ja/', '/').replace('/en/', '/')
  }, [router.asPath])
  const pageInfo = useMemo(() => {
    const pages = docMenuNav
      .map((item) => {
        if (item.href) {
          return item
        }
        if (item.children) {
          return item.children.map((i) => i)
        }
      })
      .flat()
    const currentPageNum = pages.findIndex(
      (item) => asPathWithoutLang === item?.href
    )

    return {
      previousPage: pages[currentPageNum - 1],
      nextPage: pages[currentPageNum + 1],
    }
  }, [asPathWithoutLang])

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex-1">
          {pageInfo.previousPage && (
            <>
              <div className="group hover:cursor-pointer">
                <Link href={pageInfo.previousPage.href ?? ''}>
                  <div className="w-full border hover:bg-gray-50 dark:hover:bg-gray-800">
                    <div className="relative p-4">
                      <p className="flex items-center text-sm font-light text-gray-900 group-hover:text-gray-600 dark:text-gray-50 dark:group-hover:text-gray-300">
                        <ArrowSmallLeftIcon className="mr-2 h-3 w-3" />
                        {t('doc:previousPage')}
                      </p>
                      <h3 className="mt-2 font-semibold leading-6 text-gray-900 group-hover:text-gray-600 dark:text-gray-50 dark:group-hover:text-gray-300">
                        <span className="absolute inset-0" />
                        {t(pageInfo.previousPage.name)}
                      </h3>
                    </div>
                  </div>
                </Link>
              </div>
            </>
          )}
        </div>
        <div className="flex-1">
          {pageInfo.nextPage && (
            <>
              <div className="group hover:cursor-pointer">
                <Link href={pageInfo.nextPage.href ?? ''}>
                  <div className="w-full border hover:bg-gray-50 dark:hover:bg-gray-800">
                    <div className="relative p-4">
                      <p className="flex items-center justify-end text-sm font-light text-gray-900 group-hover:text-gray-600 dark:text-gray-50 dark:group-hover:text-gray-300">
                        {t('doc:nextPage')}
                        <ArrowSmallRightIcon className="ml-2 h-3 w-3" />
                      </p>
                      <h3 className="text mt-2 text-right font-semibold leading-6 text-gray-900 group-hover:text-gray-600 dark:text-gray-50 dark:group-hover:text-gray-300">
                        <span className="absolute inset-0" />
                        {t(pageInfo.nextPage.name)}
                      </h3>
                    </div>
                  </div>
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
