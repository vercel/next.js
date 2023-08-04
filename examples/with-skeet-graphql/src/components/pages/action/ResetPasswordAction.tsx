import { useCallback, useEffect, useState, useMemo } from 'react'
import { useTranslation } from 'next-i18next'
import { auth } from '@/lib/firebase'
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth'
import { passwordSchema } from '@/utils/form'
import LogoHorizontal from '@/components/common/atoms/LogoHorizontal'
import clsx from 'clsx'
import AppLoading from '@/components/loading/AppLoading'
import { z } from 'zod'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import useToastMessage from '@/hooks/useToastMessage'
import { useRouter } from 'next/router'

const schema = z.object({
  password: passwordSchema,
})

type Inputs = z.infer<typeof schema>

type Props = {
  oobCode: string
}

export default function ResetPasswordAction({ oobCode }: Props) {
  const [isLoading, setLoading] = useState(true)
  const [isRegisterLoading, setRegisterLoading] = useState(false)
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const addToast = useToastMessage()
  const router = useRouter()

  const verifyEmail = useCallback(async () => {
    try {
      if (!auth) throw new Error('auth not initialized')
      const gotEmail = await verifyPasswordResetCode(auth, oobCode)
      setEmail(gotEmail)
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
  }, [router, t, oobCode, addToast])

  useEffect(() => {
    verifyEmail()
  }, [verifyEmail])

  const {
    handleSubmit,
    formState: { errors },
    control,
  } = useForm<Inputs>({
    resolver: zodResolver(schema),
    defaultValues: {
      password: '',
    },
  })

  const onSubmit = useCallback(
    async (data: Inputs) => {
      try {
        setRegisterLoading(true)
        if (!auth) throw new Error('auth not initialized')
        await confirmPasswordReset(auth, oobCode, data.password)
        addToast({
          type: 'success',
          title: t('auth:resetPasswordSuccessTitle'),
          description: t('auth:resetPasswordSuccessBody'),
        })
        router.push('/auth/login')
      } catch (err) {
        console.error(err)
        addToast({
          type: 'error',
          title: t('auth:resetPasswordErrorTitle'),
          description: t('auth:resetPasswordErrorBody'),
        })
      } finally {
        setRegisterLoading(false)
      }
    },
    [oobCode, t, router, addToast]
  )

  const isDisabled = useMemo(
    () => isLoading || isRegisterLoading || errors.password != null,
    [isLoading, isRegisterLoading, errors.password]
  )

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
          <LogoHorizontal className="mx-auto w-24" />
          <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            {t('inputNewPassword')}
          </h2>
          <p className="mt-4 text-center text-base font-light tracking-tight text-gray-700 dark:text-gray-300">
            {email}
          </p>
        </div>
        <div className="w-full sm:mx-auto sm:max-w-md">
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="flex flex-col gap-6 px-4 py-6 sm:px-10">
              <div>
                <p className="text-sm font-medium leading-6 text-gray-900 dark:text-gray-50">
                  {t('auth:password')}
                  {errors.password && (
                    <span className="text-xs text-red-500 dark:text-red-300">
                      {' : '}
                      {t('auth:passwordErrorText')}
                    </span>
                  )}
                </p>
                <div className="mt-2">
                  <Controller
                    name="password"
                    control={control}
                    render={({ field }) => (
                      <input
                        {...field}
                        type="password"
                        className="w-full border-2 border-gray-900 p-3 text-lg font-bold text-gray-900 dark:border-gray-50 dark:text-white sm:leading-6"
                      />
                    )}
                  />
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={isDisabled}
                  className={clsx(
                    isDisabled
                      ? 'cursor-not-allowed bg-gray-300 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                      : 'bg-gray-900 text-white hover:bg-gray-700 dark:bg-gray-50 dark:text-gray-900 dark:hover:bg-gray-200',
                    'w-full px-3 py-2 text-center text-lg font-bold'
                  )}
                >
                  {t('auth:registerAccount')}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
