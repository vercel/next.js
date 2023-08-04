import Button from '@/components/common/atoms/Button'
import { useTranslation } from 'next-i18next'

export default function InvalidParamsError() {
  const { t } = useTranslation()

  return (
    <>
      <div className="h-full">
        <div className="grid min-h-screen place-items-center px-6 py-24 sm:py-32 lg:px-8">
          <div className="-translate-y-32 text-center">
            <p className="mb-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-50 sm:text-5xl">
              {t('auth:invalidParamsErrorTitle')}
            </p>
            <p className="text-base font-normal tracking-tight text-gray-900 dark:text-gray-50 sm:text-2xl">
              {t('auth:invalidParamsErrorBody')}
            </p>
            <div className="mt-8 flex items-center justify-center gap-x-6">
              <Button href="/">{t('auth:goToLogin')}</Button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
