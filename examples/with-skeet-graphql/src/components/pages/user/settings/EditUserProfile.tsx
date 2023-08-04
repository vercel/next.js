import clsx from 'clsx'
import { PencilSquareIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useTranslation } from 'next-i18next'
import { useState, useCallback, useMemo, Fragment } from 'react'
import LogoHorizontal from '@/components/common/atoms/LogoHorizontal'
import { useRecoilState } from 'recoil'
import { userState } from '@/store/user'
import { usernameSchema } from '@/utils/form'
import useToastMessage from '@/hooks/useToastMessage'
import { Dialog, Transition } from '@headlessui/react'
import { z } from 'zod'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { graphql } from 'relay-runtime'
import { useMutation } from 'react-relay'
import {
  EditUserProfileMutation,
  EditUserProfileMutation$data,
} from '@/__generated__/EditUserProfileMutation.graphql'

const schema = z.object({
  username: usernameSchema,
})

type Inputs = z.infer<typeof schema>

const editUserProfileMutation = graphql`
  mutation EditUserProfileMutation($id: String, $username: String) {
    updateUser(id: $id, username: $username) {
      username
    }
  }
`

export default function EditUserProfile() {
  const { t } = useTranslation()
  const [isModalOpen, setModalOpen] = useState(false)
  const [isLoading, setLoading] = useState(false)
  const [user, setUser] = useRecoilState(userState)
  const addToast = useToastMessage()
  const [commit] = useMutation<EditUserProfileMutation>(editUserProfileMutation)

  const {
    handleSubmit,
    formState: { errors },
    control,
  } = useForm<Inputs>({
    resolver: zodResolver(schema),
    defaultValues: {
      username: user.username,
    },
  })

  const onSubmit = useCallback(
    async (data: Inputs) => {
      try {
        setLoading(true)
        commit({
          variables: {
            id: user.id,
            username: data.username,
          },
          onCompleted: (result: EditUserProfileMutation$data) => {
            setUser({
              ...user,
              username: data.username,
            })
            addToast({
              type: 'success',
              title: t('settings:updateProfileSuccess'),
              description: t('settings:updateProfileSuccessMessage'),
            })
            setModalOpen(false)
            setLoading(false)
          },
          onError: (err) => {
            console.error(err.message)
            addToast({
              type: 'error',
              title: t('settings:updateProfileError'),
              description: t('settings:updateProfileErrorMessage'),
            })
            setModalOpen(false)
            setLoading(false)
          },
          updater: (store) => {
            store.invalidateStore()
          },
        })
      } catch (err) {
        console.error(err)
        if (
          err instanceof Error &&
          (err.message.includes('Firebase ID token has expired.') ||
            err.message.includes('Error: getUserAuth'))
        ) {
          addToast({
            type: 'error',
            title: t('errorTokenExpiredTitle'),
            description: t('errorTokenExpiredBody'),
          })
        } else {
          addToast({
            type: 'error',
            title: t('settings:updateProfileError'),
            description: t('settings:updateProfileErrorMessage'),
          })
        }
        setModalOpen(false)
        setLoading(false)
      }
    },
    [t, user, setUser, addToast, setModalOpen, setLoading, commit]
  )

  const isDisabled = useMemo(
    () => isLoading || errors.username != null,
    [isLoading, errors.username]
  )

  return (
    <>
      <div className="p-4 text-center sm:text-left">
        <p className="text-3xl font-bold text-gray-900 dark:text-gray-50">
          {user.username}
        </p>
        <p className="font-medium text-gray-500 dark:text-gray-300">
          {user.email}
        </p>
      </div>
      <div className="flex flex-row justify-center p-2 sm:justify-start">
        <button
          className={clsx(
            'flex flex-row items-center px-2 py-2 text-sm font-medium text-gray-900 hover:text-gray-700 dark:text-gray-50 dark:hover:text-gray-300'
          )}
          onClick={() => {
            setModalOpen(true)
          }}
        >
          <PencilSquareIcon className="mr-3 h-6 w-6 flex-shrink-0" />
          <span className="py-2 font-medium">{t('settings:editProfile')}</span>
        </button>
      </div>
      <Transition appear show={isModalOpen} as={Fragment}>
        <Dialog
          as="div"
          className="fixed inset-0 z-10 overflow-y-auto"
          onClose={() => setModalOpen(false)}
        >
          <div className="px-4 text-center">
            <Dialog.Overlay className="fixed inset-0 bg-black opacity-30" />

            {/* This element is to trick the browser into centering the modal contents. */}
            <span
              className="inline-block h-screen align-middle"
              aria-hidden="true"
            >
              &#8203;
            </span>
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <div className="my-8 inline-block w-full max-w-xl -translate-y-10 transform overflow-hidden bg-white p-6 text-left align-middle shadow-xl transition-all dark:bg-gray-900">
                <div className="flex w-full flex-col bg-white pb-8 dark:bg-gray-900">
                  <div className="flex flex-row items-center justify-center p-4">
                    <LogoHorizontal className="w-24" />
                    <div className="flex-grow" />
                    <button
                      onClick={() => {
                        setModalOpen(false)
                      }}
                      className="h-5 w-5 hover:cursor-pointer"
                    >
                      <XMarkIcon className="h-5 w-5 text-gray-900 hover:text-gray-800 dark:text-gray-50 dark:hover:text-gray-100" />
                    </button>
                  </div>
                  <div className="flex flex-grow flex-col gap-8 pt-10">
                    <p className="text-center text-lg font-bold">
                      {t('settings:editProfile')}
                    </p>
                    <div className="w-full sm:mx-auto sm:max-w-xl">
                      <div className="gap-6 px-4 sm:px-10">
                        <form onSubmit={handleSubmit(onSubmit)}>
                          <div className="flex flex-col gap-6 px-4 py-6 sm:px-10">
                            <div>
                              <p className="text-sm font-medium leading-6 text-gray-900 dark:text-gray-50">
                                {t('settings:username')}
                                {errors.username && (
                                  <span className="text-xs text-red-500 dark:text-red-300">
                                    {' : '}
                                    {t('settings:usernameErrorText')}
                                  </span>
                                )}
                              </p>
                              <div className="mt-2">
                                <Controller
                                  name="username"
                                  control={control}
                                  render={({ field }) => (
                                    <input
                                      {...field}
                                      className="w-full border-2 border-gray-900 p-3 text-lg font-bold text-gray-900 dark:border-gray-50 dark:text-white sm:leading-6"
                                      inputMode="text"
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
                                {t('settings:register')}
                              </button>
                            </div>
                          </div>
                        </form>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Transition.Child>
          </div>
        </Dialog>
      </Transition>
    </>
  )
}
