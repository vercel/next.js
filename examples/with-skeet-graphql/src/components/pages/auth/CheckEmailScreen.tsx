import { useTranslation } from 'next-i18next'
import Link from '@/components/routing/Link'
import { EnvelopeOpenIcon } from '@heroicons/react/24/outline'

export default function CheckEmailScreen() {
  const { t } = useTranslation()
  return (
    <>
      <div className="flex h-full flex-col items-center justify-start py-24 sm:px-6 sm:py-36 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <EnvelopeOpenIcon className="mx-auto h-24 w-24 text-gray-900 dark:text-gray-50" />
          <p className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            {t('auth:confirmEmail')}
          </p>
          <p className="mt-2 px-2 text-center text-sm text-gray-600 dark:text-gray-300">
            {t('auth:thanksForRequest')}
          </p>
          <p className="mt-2 py-2 text-center font-medium text-indigo-500 hover:text-indigo-400 dark:text-indigo-200 dark:hover:text-indigo-300">
            <Link className="" href="/auth/login">
              {t('auth:goToLogin')}
            </Link>
          </p>
        </div>
      </div>
    </>
  )
}
