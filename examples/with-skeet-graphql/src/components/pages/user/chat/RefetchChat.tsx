import { ChatScreenQuery$variables } from '@/__generated__/ChatScreenQuery.graphql'
import { ArrowPathIcon } from '@heroicons/react/24/outline'
import clsx from 'clsx'
import { useTranslation } from 'next-i18next'

type Props = {
  refetch: (variables: ChatScreenQuery$variables) => void
}

export default function RefetchChat({ refetch }: Props) {
  const { t } = useTranslation()
  return (
    <>
      <div className="flex h-full w-full flex-col items-center justify-center bg-gray-50 dark:bg-gray-800">
        <div className="flex w-full max-w-md flex-col items-center justify-center gap-6 p-4">
          <h2 className="text-xl font-bold text-gray-700 dark:text-gray-200">
            {t('chat:pleaseRefetch')}
          </h2>
          <button
            onClick={() => {
              refetch({ first: 15 })
            }}
            className={clsx(
              'flex w-full flex-row items-center justify-center gap-4 bg-gray-900 px-3 py-2 hover:cursor-pointer hover:bg-gray-700 dark:bg-gray-600 dark:hover:bg-gray-400'
            )}
          >
            <ArrowPathIcon className="h-6 w-6 text-white" />
            <span className="text-lg font-bold text-white">
              {t('chat:refetchButton')}
            </span>
          </button>
        </div>
      </div>
    </>
  )
}
