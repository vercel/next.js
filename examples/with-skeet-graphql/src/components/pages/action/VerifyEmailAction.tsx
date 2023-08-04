import { useCallback, useEffect, useState } from 'react'

import { useTranslation } from 'next-i18next'
import { auth } from '@/lib/firebase'
import { applyActionCode } from 'firebase/auth'
import AppLoading from '@/components/loading/AppLoading'
import { useRouter } from 'next/router'
import { CheckCircleIcon } from '@heroicons/react/24/outline'
import useToastMessage from '@/hooks/useToastMessage'
import Button from '@/components/common/atoms/Button'

type Props = {
  oobCode: string
}

export default function VerifyEmailAction({ oobCode }: Props) {
  const [isLoading, setLoading] = useState(true)
  const { t } = useTranslation()
  const router = useRouter()
  const addToast = useToastMessage()

  const verifyUser = useCallback(async () => {
    if (auth) {
      try {
        await applyActionCode(auth, oobCode)
        addToast({
          type: 'success',
          title: t('auth:verifySuccessTitle'),
          description: t('auth:verifySuccessBody'),
        })
        setLoading(false)
      } catch (err) {
        console.error(err)
        addToast({
          type: 'error',
          title: t('auth:verifyErrorTitle'),
          description: t('auth:verifyErrorBody'),
        })
        router.push('/auth/login')
      }
    }
  }, [router, t, oobCode, addToast, setLoading])

  useEffect(() => {
    verifyUser()
  }, [verifyUser])

  if (isLoading) {
    return (
      <>
        <AppLoading />
      </>
    )
  }

  return (
    <>
      <div className="h-full w-full flex-col items-center justify-center">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <CheckCircleIcon className="mx-auto h-24 w-24 text-green-500 dark:text-green-300" />
          <p className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            {t('auth:confirmDoneTitle')}
          </p>
          <p className="mt-2 px-2 text-center text-sm text-gray-600 dark:text-gray-300">
            {t('auth:confirmDoneBody')}
          </p>
          <div className="mt-8 flex items-center justify-center gap-x-6">
            <Button href="/auth/login">{t('auth:backToLogin')}</Button>
          </div>
        </div>
      </div>
    </>
  )
}
