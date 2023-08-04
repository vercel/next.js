import clsx from 'clsx'
import Image from 'next/image'
import {
  PencilSquareIcon,
  PhotoIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { useTranslation } from 'next-i18next'
import { Fragment, useCallback, useMemo, useState } from 'react'
import { useRecoilState } from 'recoil'
import { userState } from '@/store/user'
import { storage } from '@/lib/firebase'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import useToastMessage from '@/hooks/useToastMessage'
import { Dialog, Transition } from '@headlessui/react'
import { useDropzone } from 'react-dropzone'
import LogoHorizontal from '@/components/common/atoms/LogoHorizontal'
import { graphql, useMutation } from 'react-relay'
import {
  EditUserIconUrlMutation,
  EditUserIconUrlMutation$data,
} from '@/__generated__/EditUserIconUrlMutation.graphql'

const editUserIconUrlMutation = graphql`
  mutation EditUserIconUrlMutation($id: String, $iconUrl: String) {
    updateUser(id: $id, iconUrl: $iconUrl) {
      iconUrl
    }
  }
`

export default function EditUserIconUrl() {
  const { t } = useTranslation()
  const [user, setUser] = useRecoilState(userState)
  const addToast = useToastMessage()
  const [isLoading, setLoading] = useState(false)
  const [image, setImage] = useState<File | null>(null)
  const [imageUrl, setImageUrl] = useState<null | string>(null)
  const [commit] = useMutation<EditUserIconUrlMutation>(editUserIconUrlMutation)

  const [isModalOpen, setModalOpen] = useState(false)

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        const file = acceptedFiles[0]
        const objectUrl = URL.createObjectURL(file)
        setImage(file)
        setImageUrl(objectUrl)
      }
    },
  })

  const uploadImage = useCallback(async () => {
    try {
      setLoading(true)
      if (image && storage && user.uid !== '') {
        const newProfileIconRef = ref(
          storage,
          `User/${user.uid}/profileIcon/profile.${image.type.split('/')[1]}`
        )
        await uploadBytes(newProfileIconRef, image)

        const downloadUrl = await getDownloadURL(newProfileIconRef)

        commit({
          variables: {
            id: user.id,
            iconUrl: downloadUrl,
          },
          onCompleted: (result: EditUserIconUrlMutation$data) => {
            setUser({
              ...user,
              iconUrl: downloadUrl,
            })

            addToast({
              type: 'success',
              title: t('settings:avatarUpdated'),
              description: t('settings:avatarUpdatedMessage'),
            })
            setImage(null)
            setImageUrl(null)
            setModalOpen(false)
          },
          onError: (err) => {
            console.error(err.message)
            addToast({
              type: 'error',
              title: t('settings:avatarUpdatedError'),
              description: t('settings:avatarUpdatedErrorMessage'),
            })
          },
          updater: (store) => {
            store.invalidateStore()
          },
        })
      }
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
          title: t('settings:avatarUpdatedError'),
          description: t('settings:avatarUpdatedErrorMessage'),
        })
      }
    } finally {
      setLoading(false)
    }
  }, [user, setUser, t, image, addToast, commit])

  const isDisabled = useMemo(() => {
    return image == null || isLoading
  }, [image, isLoading])

  return (
    <>
      <div className="p-2">
        <Image
          src={user.iconUrl}
          alt="User icon"
          className="h-32 w-32 rounded-full"
          width={128}
          height={128}
          unoptimized
        />
      </div>
      <div className="flex w-full flex-col items-center justify-center">
        <button
          className={clsx(
            'flex flex-row items-center px-2 py-2 text-sm font-medium text-gray-900 hover:text-gray-700 dark:text-gray-50 dark:hover:text-gray-300'
          )}
          onClick={() => {
            setModalOpen(true)
          }}
        >
          <PencilSquareIcon className="mr-3 h-6 w-6 flex-shrink-0" />
          <span>{t('settings:editIconUrl')}</span>
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
                <div className="flex w-full flex-col bg-white pb-12 dark:bg-gray-900">
                  <div className="flex flex-row items-center justify-center p-4">
                    <LogoHorizontal className="w-24" />
                    <div className="flex-grow" />
                    <button
                      onClick={() => {
                        setModalOpen(false)
                      }}
                      className="h-5 w-5"
                    >
                      <XMarkIcon className="h-5 w-5 text-gray-900 hover:text-gray-800 dark:text-gray-50 dark:hover:text-gray-100" />
                    </button>
                  </div>
                  <div className="flex flex-grow flex-col gap-2 pt-10">
                    <p className="text-center text-lg font-bold">
                      {t('settings:editIconUrl')}
                    </p>
                    <div className="w-full sm:mx-auto sm:max-w-xl">
                      <div className="gap-6 px-4 sm:px-10">
                        <div
                          {...getRootProps()}
                          className="flex h-64 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-4 border-dashed border-gray-200 p-10 hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                          <input {...getInputProps()} />
                          <PhotoIcon className="h-16 w-16 text-gray-400 dark:text-gray-300" />
                          {isDragActive ? (
                            <p className="text-sm text-gray-500 dark:text-gray-300">
                              {t('settings:dropFiles')}
                            </p>
                          ) : (
                            <p className="text-sm text-gray-500 dark:text-gray-300">
                              {t('settings:dragDropFiles')}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div>
                      {image && imageUrl && (
                        <>
                          <Image
                            src={imageUrl}
                            alt="User icon"
                            width={12}
                            height={12}
                            className="mx-auto h-16 w-16"
                          />
                        </>
                      )}
                    </div>
                    <div>
                      <button
                        onClick={() => {
                          uploadImage()
                        }}
                        disabled={isDisabled}
                        className={clsx(
                          isDisabled
                            ? 'cursor-not-allowed bg-gray-300 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                            : 'bg-gray-900 text-white hover:bg-gray-700 dark:bg-gray-50 dark:text-gray-900 dark:hover:bg-gray-200',
                          'w-full px-3 py-2 text-center text-lg font-bold'
                        )}
                      >
                        {t('settings:upload')}
                      </button>
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
