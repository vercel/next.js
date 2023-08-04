import LanguageChanger from '@/components/utils/LanguageChanger'
import ColorModeChanger from '@/components/utils/ColorModeChanger'
import { useTranslation } from 'next-i18next'

import EditUserIconUrl from '@/components/pages/user/settings/EditUserIconUrl'
import EditUserProfile from '@/components/pages/user/settings/EditUserProfile'

export default function SettingsScreen() {
  const { t } = useTranslation()

  return (
    <>
      <div className="h-24 w-full bg-white dark:bg-gray-900">
        <div className="flex flex-row items-center justify-between p-6 md:justify-start md:gap-10">
          <div className="flex flex-1">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-50">
              {t('settings:title')}
            </h2>
          </div>
          <div className="flex flex-row items-center justify-end gap-6">
            <LanguageChanger />
            <ColorModeChanger />
          </div>
        </div>
      </div>
      <div className="flex w-full flex-col items-center justify-center bg-white dark:bg-gray-900 sm:items-start">
        <div className="flex w-full max-w-md flex-col items-center px-4 sm:flex-row sm:gap-8">
          <div className="flex w-full flex-col items-center sm:w-96">
            <EditUserIconUrl />
          </div>
          <div className="flex w-full flex-col">
            <EditUserProfile />
          </div>
        </div>
      </div>
    </>
  )
}
