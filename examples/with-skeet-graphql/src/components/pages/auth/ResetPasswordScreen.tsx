import { useTranslation } from 'next-i18next'
import LogoHorizontal from '@/components/common/atoms/LogoHorizontal'
import { useCallback, useState, useMemo } from 'react'
import { emailSchema } from '@/utils/form'
import clsx from 'clsx'
import { auth } from '@/lib/firebase'
import { sendPasswordResetEmail } from 'firebase/auth'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, Controller } from 'react-hook-form'
import Link from '@/components/routing/Link'
import useToastMessage from '@/hooks/useToastMessage'
import { useRouter } from 'next/router'

const schema = z.object({
  email: emailSchema,
})

type Inputs = z.infer<typeof schema>

export default function ResetPasswordScreen() {
  const { t } = useTranslation()
  const [isLoading, setLoading] = useState(false)
  const addToast = useToastMessage()
  const router = useRouter()

  const {
    handleSubmit,
    formState: { errors },
    control,
  } = useForm<Inputs>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: '',
    },
  })

  const onSubmit = useCallback(
    async (data: Inputs) => {
      if (auth) {
        try {
          setLoading(true)
          await sendPasswordResetEmail(auth, data.email)
          addToast({
            type: 'success',
            title: t('auth:sentResetPasswordRequest'),
            description: t('auth:confirmEmail'),
          })
          router.push('/auth/check-email')
        } catch (err) {
          console.error(err)
          if (err instanceof Error && err.message === 'Not verified') {
            addToast({
              type: 'error',
              title: t('auth:errorNotVerifiedTitle'),
              description: t('auth:errorNotVerifiedBody'),
            })
          } else if (
            err instanceof Error &&
            err.message.includes('auth/user-not-found')
          ) {
            addToast({
              type: 'error',
              title: t('auth:userNotFoundTitle'),
              description: t('auth:userNotFoundBody'),
            })
          } else {
            addToast({
              type: 'error',
              title: t('errorLoginTitle'),
              description: t('errorLoginBody'),
            })
          }
        } finally {
          setLoading(false)
        }
      }
    },
    [t, addToast, router]
  )

  const isDisabled = useMemo(
    () => isLoading || errors.email != null,
    [isLoading, errors.email]
  )

  return (
    <>
      <div className="flex h-full flex-col items-center justify-start py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <LogoHorizontal className="mx-auto w-24" />
          <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            {t('auth:resetYourPassword')}
          </h2>

          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-300">
            <Link href="/auth/register">
              {t('auth:or')}{' '}
              <span className="font-medium text-indigo-500 hover:text-indigo-400 dark:text-indigo-200 dark:hover:text-indigo-300">
                {t('auth:registerYourAccount')}
              </span>
            </Link>
          </p>
        </div>
        <div className="w-full sm:mx-auto sm:max-w-md">
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="flex flex-col gap-6 px-4 py-6 sm:px-10">
              <div>
                <p className="text-sm font-medium leading-6 text-gray-900 dark:text-gray-50">
                  {t('auth:email')}
                  {errors.email && (
                    <span className="text-xs text-red-500 dark:text-red-300">
                      {' : '}
                      {t('auth:emailErrorText')}
                    </span>
                  )}
                </p>
                <div className="mt-2">
                  <Controller
                    name="email"
                    control={control}
                    render={({ field }) => (
                      <input
                        {...field}
                        className="w-full border-2 border-gray-900 p-3 text-lg font-bold text-gray-900 dark:border-gray-50 dark:text-white sm:leading-6"
                        inputMode="email"
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
                  {t('auth:reset')}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
