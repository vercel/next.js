import { useTranslation } from 'next-i18next'
import LogoHorizontal from '@/components/common/atoms/LogoHorizontal'
import clsx from 'clsx'
import { useCallback, useMemo, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
} from 'firebase/auth'
import { auth } from '@/lib/firebase'
import useToastMessage from '@/hooks/useToastMessage'
import { useRouter } from 'next/router'
import { emailSchema, passwordSchema, privacySchema } from '@/utils/form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, Controller } from 'react-hook-form'
import Link from '@/components/routing/Link'

const schema = z.object({
  email: emailSchema,
  password: passwordSchema,
  privacy: privacySchema,
})

type Inputs = z.infer<typeof schema>

export default function RegisterScreen() {
  const { t, i18n } = useTranslation()
  const isJapanese = useMemo(() => i18n.language === 'ja', [i18n])
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
      password: '',
      privacy: false,
    },
  })

  const onSubmit = useCallback(
    async (data: Inputs) => {
      if (auth && data.privacy) {
        try {
          setLoading(true)
          auth.languageCode = isJapanese ? 'ja' : 'en'
          const userCredential = await createUserWithEmailAndPassword(
            auth,
            data.email,
            data.password
          )
          await sendEmailVerification(userCredential.user)
          await signOut(auth)

          addToast({
            type: 'success',
            title: t('auth:sentConfirmEmailTitle'),
            description: t('auth:sentConfirmEmailBody'),
          })

          router.push('/auth/check-email')
        } catch (err) {
          console.error(err)

          if (
            err instanceof Error &&
            err.message.includes('Firebase: Error (auth/email-already-in-use).')
          ) {
            addToast({
              type: 'error',
              title: t('auth:alreadyExistTitle'),
              description: t('auth:alreadyExistBody'),
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
    [t, isJapanese, addToast, router]
  )

  const isDisabled = useMemo(
    () =>
      isLoading ||
      errors.email != null ||
      errors.password != null ||
      errors.privacy != null,
    [isLoading, errors.email, errors.password, errors.privacy]
  )

  return (
    <>
      <div className="flex h-full flex-col items-center justify-start py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <LogoHorizontal className="mx-auto w-24" />

          <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            {t('auth:registerYourAccount')}
          </h2>

          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-300">
            <Link href="/auth/login">
              {t('auth:or')}{' '}
              <span className="font-medium text-indigo-500 hover:text-indigo-400 dark:text-indigo-200 dark:hover:text-indigo-300">
                {t('auth:loginToYourAccount')}
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
                <div className="flex flex-row items-center">
                  <Controller
                    name="privacy"
                    control={control}
                    render={({ field: { onChange, value, ref } }) => (
                      <input
                        type="checkbox"
                        onChange={(e) => onChange(e.target.checked)}
                        checked={value}
                        ref={ref}
                        className="mr-2 border-2 border-gray-900 leading-tight dark:border-gray-50"
                      />
                    )}
                  />
                  <p className="text-sm">
                    {t('agreeOn')}{' '}
                    <Link
                      href="/legal/privacy-policy"
                      className="text-indigo-500 hover:text-indigo-400 dark:text-indigo-200 dark:hover:text-indigo-300"
                    >
                      {t('privacy')}
                    </Link>
                  </p>
                </div>
                {errors.privacy && (
                  <p className="mt-2 text-xs text-red-500 dark:text-red-300">
                    {t('auth:privacyErrorText')}
                  </p>
                )}
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
                  {t('register')}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
