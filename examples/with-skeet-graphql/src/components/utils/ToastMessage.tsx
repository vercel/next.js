import { Fragment, useEffect } from 'react'
import { Transition } from '@headlessui/react'
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline'
import { XMarkIcon } from '@heroicons/react/20/solid'
import { useRecoilState } from 'recoil'
import { toastsState } from '@/store/toasts'

export default function ToastMessage() {
  const [toasts, setToasts] = useRecoilState(toastsState)

  useEffect(() => {
    const interval = setInterval(() => {
      if (toasts.length > 0) {
        setToasts(toasts.filter((toast) => toast.createdAt > Date.now() - 4000))
      }
    }, 200)

    return () => {
      clearInterval(interval)
    }
  }, [toasts, setToasts])

  return (
    <>
      <div
        aria-live="assertive"
        className="pointer-events-none fixed inset-0 z-20 flex items-end px-4 py-6 sm:items-start sm:p-6"
      >
        <div className="flex w-full flex-col items-center space-y-4 sm:items-end">
          {toasts.map((toast, toastIdx) => (
            <Transition
              key={`ToastMessage ${toastIdx}`}
              show={toast.createdAt > Date.now() - 4000}
              as={Fragment}
              enter="transform ease-out duration-300 transition"
              enterFrom="translate-y-2 opacity-0 sm:translate-y-0 sm:translate-x-2"
              enterTo="translate-y-0 opacity-100 sm:translate-x-0"
              leave="transition ease-in duration-100"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <div className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-lg bg-white shadow-lg ring-1 ring-black ring-opacity-5 dark:bg-gray-700">
                <div className="p-4">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      {toast.type === 'success' && (
                        <CheckCircleIcon
                          className="h-6 w-6 text-green-400"
                          aria-hidden="true"
                        />
                      )}
                      {toast.type === 'error' && (
                        <ExclamationCircleIcon
                          className="h-6 w-6 text-red-400"
                          aria-hidden="true"
                        />
                      )}
                      {toast.type === 'warning' && (
                        <ExclamationCircleIcon
                          className="h-6 w-6 text-yellow-400"
                          aria-hidden="true"
                        />
                      )}
                      {toast.type === 'info' && (
                        <InformationCircleIcon
                          className="h-6 w-6 text-blue-400"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <div className="ml-3 w-0 flex-1 pt-0.5">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {toast.title}
                      </p>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-200">
                        {toast.description}
                      </p>
                    </div>
                    <div className="ml-4 flex flex-shrink-0">
                      <button
                        type="button"
                        className="inline-flex rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:bg-gray-700 dark:text-gray-200 dark:hover:text-gray-400"
                        onClick={() => {
                          const newToasts = toasts.filter(
                            (_, idx) => idx !== toastIdx
                          )
                          setToasts(newToasts)
                        }}
                      >
                        <span className="sr-only">Close</span>
                        <XMarkIcon className="h-5 w-5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </Transition>
          ))}
        </div>
      </div>
    </>
  )
}
