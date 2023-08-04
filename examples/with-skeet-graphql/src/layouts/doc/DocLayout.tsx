import type { ReactNode } from 'react'
import { useMemo, useCallback, useEffect, useState, Fragment } from 'react'
import CommonFooter from '@/layouts/common/CommonFooter'
import { Transition, Dialog, Menu } from '@headlessui/react'
import {
  XMarkIcon,
  Bars3BottomLeftIcon,
  EllipsisVerticalIcon,
} from '@heroicons/react/24/outline'
import { useRouter } from 'next/router'
import LogoHorizontalLink from '@/components/common/atoms/LogoHorizontalLink'
import clsx from 'clsx'
import { docHeaderNav, docMenuNav } from '@/config/navs'
import { useTranslation } from 'next-i18next'
import Link from '@/components/routing/Link'
import LanguageChanger from '@/components/utils/LanguageChanger'
import ColorModeChanger from '@/components/utils/ColorModeChanger'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faDiscord, faGithub } from '@fortawesome/free-brands-svg-icons'
import siteConfig from '@/config/site'

type Props = {
  children: ReactNode
}

const mainContentId = 'docMainContent'

export default function DocLayout({ children }: Props) {
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { t } = useTranslation()

  const asPathWithoutLang = useMemo(() => {
    return router.asPath.replace('/ja/', '/').replace('/en/', '/')
  }, [router.asPath])

  const resetWindowScrollPosition = useCallback(() => {
    const element = document.getElementById(mainContentId)
    if (element) {
      element.scrollIntoView({ block: 'start' })
    }
  }, [])
  useEffect(() => {
    ;(async () => {
      setSidebarOpen(false)
      await new Promise((resolve) => setTimeout(resolve, 100))
      if (!router.asPath.includes('#')) {
        resetWindowScrollPosition()
      }
    })()
  }, [router.asPath, resetWindowScrollPosition])

  return (
    <>
      <div className="relative h-full w-full bg-white dark:bg-gray-900">
        <Transition.Root show={sidebarOpen} as={Fragment}>
          <Dialog
            as="div"
            className="relative z-40 bg-white dark:bg-gray-900 lg:hidden"
            onClose={setSidebarOpen}
          >
            <Transition.Child
              as={Fragment}
              enter="transition-opacity ease-linear duration-300"
              enterFrom="opacity-0"
              enterTo="opacity-100"
              leave="transition-opacity ease-linear duration-300"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <div className="fixed inset-0 bg-gray-900 bg-opacity-90" />
            </Transition.Child>

            <div className="fixed inset-0 z-40 flex">
              <Transition.Child
                as={Fragment}
                enter="transition ease-in-out duration-300 transform"
                enterFrom="-translate-x-full"
                enterTo="translate-x-0"
                leave="transition ease-in-out duration-300 transform"
                leaveFrom="translate-x-0"
                leaveTo="-translate-x-full"
              >
                <Dialog.Panel className="relative flex w-full max-w-xs flex-1 flex-col bg-white pb-4 pt-5 dark:bg-gray-900">
                  <Transition.Child
                    as={Fragment}
                    enter="ease-in-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in-out duration-300"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                  >
                    <div className="absolute right-0 top-0 -mr-12 pt-2">
                      <button
                        type="button"
                        className="ml-1 flex h-10 w-10 items-center justify-center focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
                        onClick={() => setSidebarOpen(false)}
                      >
                        <span className="sr-only">Close sidebar</span>
                        <XMarkIcon
                          className="h-6 w-6 text-white"
                          aria-hidden="true"
                        />
                      </button>
                    </div>
                  </Transition.Child>
                  <div className="flex flex-shrink-0 items-center px-4">
                    <LogoHorizontalLink className="h-8 w-auto sm:h-10" />
                  </div>
                  <div className="mt-5 h-0 flex-1 overflow-y-auto">
                    <nav className="space-y-1 px-2">
                      {docMenuNav.map((item) =>
                        !item.href && item.children ? (
                          <div
                            key={`DocLayout Menu ${item.name}`}
                            className="pt-2"
                          >
                            <p className="p-1 text-sm font-bold text-gray-400 dark:text-gray-300">
                              {t(item.name)}
                            </p>
                            {item.children.map((nav) => (
                              <Link
                                key={`DocLayout Menu ${item.name} ${nav.name}`}
                                href={nav.href}
                                className={clsx(
                                  asPathWithoutLang === nav.href
                                    ? 'bg-gray-50 text-gray-900 dark:bg-gray-700 dark:text-white'
                                    : 'text-gray-700 hover:bg-gray-50 dark:text-gray-50 dark:hover:bg-gray-800',
                                  'group flex items-center px-2 py-2 text-sm font-medium'
                                )}
                              >
                                <nav.icon
                                  className={clsx(
                                    asPathWithoutLang === nav.href
                                      ? 'text-gray-900  dark:text-white'
                                      : 'text-gray-700 dark:text-gray-50',
                                    'mr-3 h-6 w-6 flex-shrink-0'
                                  )}
                                  aria-hidden="true"
                                />
                                {t(nav.name)}
                              </Link>
                            ))}
                          </div>
                        ) : (
                          <Link
                            key={item.name}
                            href={item.href ?? ''}
                            className={clsx(
                              asPathWithoutLang === item.href
                                ? 'bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-white'
                                : 'text-gray-700 hover:bg-gray-50 dark:text-gray-50 dark:hover:bg-gray-800',
                              'group flex items-center px-2 py-2 text-base font-medium'
                            )}
                          >
                            {item.icon && (
                              <item.icon
                                className={clsx(
                                  asPathWithoutLang === item.href
                                    ? 'text-gray-900 dark:text-white'
                                    : 'text-gray-700 dark:text-gray-50',
                                  'mr-4 h-6 w-6 flex-shrink-0'
                                )}
                                aria-hidden="true"
                              />
                            )}
                            {t(item.name)}
                          </Link>
                        )
                      )}
                    </nav>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
              <div className="w-14 flex-shrink-0" aria-hidden="true" />
            </div>
          </Dialog>
        </Transition.Root>

        <div className="z-10 hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
          <div className="flex flex-grow flex-col overflow-y-auto break-words bg-white pt-5 scrollbar-hide dark:bg-gray-900">
            <div className="flex flex-shrink-0 items-center px-4">
              <LogoHorizontalLink className="h-8 w-auto sm:h-10" />
            </div>
            <div className="mt-5 flex flex-1 flex-col">
              <nav className="flex-1 space-y-1 px-2 pb-4">
                {docMenuNav.map((item) =>
                  !item.href && item.children ? (
                    <div key={`DocLayout Menu ${item.name}`} className="pt-2">
                      <p className="p-1 text-sm font-bold text-gray-400 dark:text-gray-300">
                        {t(item.name)}
                      </p>
                      {item.children.map((nav) => (
                        <Link
                          key={`DocLayout Menu ${item.name} ${nav.name}`}
                          href={nav.href}
                          className={clsx(
                            asPathWithoutLang === nav.href
                              ? 'bg-gray-50 text-gray-900 dark:bg-gray-700 dark:text-white'
                              : 'text-gray-700 hover:bg-gray-50 dark:text-gray-50 dark:hover:bg-gray-800',
                            'group flex items-center px-2 py-2 text-sm font-medium'
                          )}
                        >
                          <nav.icon
                            className={clsx(
                              asPathWithoutLang === nav.href
                                ? 'text-gray-900  dark:text-white'
                                : 'text-gray-700 dark:text-gray-50',
                              'mr-3 h-6 w-6 flex-shrink-0'
                            )}
                            aria-hidden="true"
                          />
                          {t(nav.name)}
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <Link
                      key={`DocLayout Menu ${item.name}`}
                      href={item.href ?? ''}
                      className={clsx(
                        asPathWithoutLang === item.href
                          ? 'bg-gray-50 text-gray-900 dark:bg-gray-700 dark:text-white'
                          : 'text-gray-700 hover:bg-gray-50 dark:text-gray-50 dark:hover:bg-gray-800',
                        'group flex items-center px-2 py-2 text-sm font-medium'
                      )}
                    >
                      {item.icon && (
                        <item.icon
                          className={clsx(
                            asPathWithoutLang === item.href
                              ? 'text-gray-900  dark:text-white'
                              : 'text-gray-700 dark:text-gray-50',
                            'mr-3 h-6 w-6 flex-shrink-0'
                          )}
                          aria-hidden="true"
                        />
                      )}
                      {t(item.name)}
                    </Link>
                  )
                )}
              </nav>
            </div>
          </div>
        </div>
        <div className="flex flex-1 flex-col lg:pl-64">
          <div className="flex-shrink- sticky top-0 z-10 flex h-16 bg-white bg-opacity-90 dark:bg-gray-900 dark:bg-opacity-90">
            <button
              type="button"
              className="px-4 text-gray-500 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-gray-500 dark:text-gray-50 dark:hover:text-gray-200 lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <span className="sr-only">Open sidebar</span>
              <Bars3BottomLeftIcon className="h-6 w-6" aria-hidden="true" />
            </button>
            <div className="flex flex-1 justify-between px-4">
              <div className="flex flex-1"></div>

              <div className="ml-4 flex items-center gap-3 lg:ml-6">
                <LanguageChanger />
                <ColorModeChanger />
                <a
                  href={`https://github.com/elsoul/skeet-cli`}
                  className="group text-gray-700 hover:text-gray-900 dark:text-gray-50 dark:hover:text-gray-200"
                  aria-label="GitHub"
                  target="_blank"
                  rel="noreferrer"
                >
                  <FontAwesomeIcon
                    icon={faGithub}
                    size="sm"
                    aria-label="GitHub icon"
                    className="ml-2 mt-1.5 h-5 w-5"
                  />
                </a>
                <a
                  href={`${siteConfig.discordInvitationLink}`}
                  className="group text-gray-700 hover:text-gray-900 dark:text-gray-50 dark:hover:text-gray-200"
                  aria-label="Discord Server Invitation"
                  target="_blank"
                  rel="noreferrer"
                >
                  <FontAwesomeIcon
                    icon={faDiscord}
                    size="sm"
                    aria-label="Discord icon"
                    className="ml-2 mt-1.5 h-5 w-5"
                  />
                </a>
                <Menu as="div" className="relative ml-3">
                  <div>
                    <Menu.Button className="flex max-w-xs items-center text-sm text-gray-700 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 dark:text-gray-50 dark:hover:text-gray-200 dark:hover:text-gray-200">
                      <span className="sr-only">Open other menu</span>
                      <EllipsisVerticalIcon className="h-8 w-8" />
                    </Menu.Button>
                  </div>
                  <Transition
                    as={Fragment}
                    enter="transition ease-out duration-100"
                    enterFrom="transform opacity-0 scale-95"
                    enterTo="transform opacity-100 scale-100"
                    leave="transition ease-in duration-75"
                    leaveFrom="transform opacity-100 scale-100"
                    leaveTo="transform opacity-0 scale-95"
                  >
                    <Menu.Items className="absolute right-0 z-10 mt-2 w-48 origin-top-right bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none dark:bg-gray-900">
                      {docHeaderNav.map((item) => (
                        <Menu.Item key={item.name}>
                          {({ active }) => (
                            <Link
                              href={item.href ?? ''}
                              className={clsx(
                                active
                                  ? 'bg-gray-50 text-gray-900 dark:bg-gray-700 dark:text-white'
                                  : '',
                                'block px-4 py-2 text-sm text-gray-700 dark:text-gray-50'
                              )}
                            >
                              {t(item.name)}
                            </Link>
                          )}
                        </Menu.Item>
                      ))}
                    </Menu.Items>
                  </Transition>
                </Menu>
              </div>
            </div>
          </div>

          <div className="py-6">
            <div
              id={mainContentId}
              className="mx-auto min-h-screen px-4 sm:px-6 lg:max-w-7xl lg:px-8"
            >
              {children}
            </div>
          </div>
          <CommonFooter />
        </div>
      </div>
    </>
  )
}
