import { Fragment } from 'react'
import { Menu, Transition } from '@headlessui/react'

import useChangeLanguage from '@/hooks/useChangeLanguage'
import { LanguageIcon } from '@heroicons/react/20/solid'
import clsx from 'clsx'

export default function LanguageChanger() {
  const { changeLanguage } = useChangeLanguage()

  return (
    <>
      <Menu as="div">
        <Menu.Button
          className={clsx(
            'text-gray-700 dark:text-gray-50',
            'group inline-flex items-center p-1 text-base font-medium hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2'
          )}
        >
          <LanguageIcon
            className={clsx(
              'text-gray-700 dark:text-gray-50',
              'h-5 w-5 group-hover:text-gray-900 dark:group-hover:text-gray-200'
            )}
            aria-hidden="true"
          />
        </Menu.Button>
        <Transition
          as={Fragment}
          enter="transition ease-out duration-200"
          enterFrom="opacity-0 translate-y-1"
          enterTo="opacity-100 translate-y-0"
          leave="transition ease-in duration-150"
          leaveFrom="opacity-100 translate-y-0"
          leaveTo="opacity-0 translate-y-1"
        >
          <Menu.Items className="absolute mt-3 w-32 -translate-x-1/2 transform px-2">
            <div className="overflow-hidden shadow-lg ring-1 ring-black ring-opacity-5">
              <Menu.Item>
                {({ close }) => (
                  <>
                    <div
                      className="relative grid gap-6 bg-white px-5 py-6 hover:cursor-pointer hover:bg-gray-50 dark:bg-gray-900 dark:hover:bg-gray-700"
                      role="button"
                      onClick={() => {
                        changeLanguage('en')
                        close()
                      }}
                    >
                      English
                    </div>
                  </>
                )}
              </Menu.Item>
              <Menu.Item>
                {({ close }) => (
                  <>
                    <div
                      className="relative grid gap-6 bg-white px-5 py-6 hover:cursor-pointer hover:bg-gray-50 dark:bg-gray-900 dark:hover:bg-gray-700"
                      role="button"
                      onClick={() => {
                        changeLanguage('ja')
                        close()
                      }}
                    >
                      日本語
                    </div>
                  </>
                )}
              </Menu.Item>
            </div>
          </Menu.Items>
        </Transition>
      </Menu>
    </>
  )
}
