import ChatMenu, { ChatRoom } from '@/components/pages/user/chat/ChatMenu'
import ChatBox, { chatBoxQuery } from '@/components/pages/user/chat/ChatBox'
import { Suspense, useCallback, useEffect, useState } from 'react'
import {
  PreloadedQuery,
  graphql,
  usePreloadedQuery,
  useQueryLoader,
} from 'react-relay'
import {
  ChatScreenQuery,
  ChatScreenQuery$variables,
} from '@/__generated__/ChatScreenQuery.graphql'
import UserScreenLoading from '@/components/loading/UserScreenLoading'
import UserScreenErrorBoundary from '@/components/error/UserScreenErrorBoundary'
import RefetchChat from './RefetchChat'
import {
  ChatBoxQuery,
  ChatBoxQuery$variables,
} from '@/__generated__/ChatBoxQuery.graphql'
import clsx from 'clsx'
import { PlusCircleIcon } from '@heroicons/react/24/outline'
import { useTranslation } from 'next-i18next'

export const chatScreenQuery = graphql`
  query ChatScreenQuery(
    $first: Int
    $after: String
    $last: Int
    $before: String
  ) {
    ...ChatMenu_query
  }
`

type Props = {
  queryReference: PreloadedQuery<ChatScreenQuery, Record<string, unknown>>
  refetch: (variables: ChatScreenQuery$variables) => void
}

export default function ChatScreen({ queryReference, refetch }: Props) {
  const { t } = useTranslation()
  const [isNewChatModalOpen, setNewChatModalOpen] = useState(false)
  const [currentChatRoomId, setCurrentChatRoomId] = useState<string | null>(
    null
  )
  const data = usePreloadedQuery(chatScreenQuery, queryReference)

  const [chatBoxQueryReference, loadQuery] =
    useQueryLoader<ChatBoxQuery>(chatBoxQuery)

  const chatBoxRefetch = useCallback(
    (variables: ChatBoxQuery$variables) => {
      loadQuery(variables, { fetchPolicy: 'network-only' })
    },
    [loadQuery]
  )

  useEffect(() => {
    if (currentChatRoomId != null) {
      loadQuery({ first: 100, chatRoomId: currentChatRoomId })
    }
  }, [currentChatRoomId, loadQuery])

  return (
    <>
      <div className="flex h-full w-full flex-col items-start justify-start overflow-auto sm:flex-row">
        <ChatMenu
          isNewChatModalOpen={isNewChatModalOpen}
          setNewChatModalOpen={setNewChatModalOpen}
          currentChatRoomId={currentChatRoomId}
          setCurrentChatRoomId={setCurrentChatRoomId}
          chatRoomsData={data}
        />
        {!currentChatRoomId && (
          <div className="flex h-full w-full flex-1 flex-col items-center justify-center bg-gray-50 dark:bg-gray-800">
            <div className="flex w-full max-w-md flex-col items-center justify-center gap-6 p-4">
              <h2 className="text-2xl font-bold text-gray-700 dark:text-gray-200">
                {t('chat:chatGPTCustom')}
              </h2>
              <button
                onClick={() => {
                  setNewChatModalOpen(true)
                }}
                className={clsx(
                  'flex w-full flex-row items-center justify-center gap-4 bg-gray-900 px-3 py-2 hover:cursor-pointer hover:bg-gray-700 dark:bg-gray-600 dark:hover:bg-gray-400'
                )}
              >
                <PlusCircleIcon className="h-6 w-6 text-white" />
                <span className="text-lg font-bold text-white">
                  {t('chat:newChat')}
                </span>
              </button>
            </div>
          </div>
        )}
        {currentChatRoomId &&
          (chatBoxQueryReference == null ? (
            <>
              <UserScreenLoading />
            </>
          ) : (
            <>
              <Suspense fallback={<UserScreenLoading />}>
                <UserScreenErrorBoundary
                  showRetry={<RefetchChat refetch={chatBoxRefetch} />}
                >
                  <ChatBox
                    currentChatRoomId={currentChatRoomId}
                    refetch={refetch}
                    chatBoxQueryReference={chatBoxQueryReference}
                    chatBoxRefetch={chatBoxRefetch}
                  />
                </UserScreenErrorBoundary>
              </Suspense>
            </>
          ))}
      </div>
    </>
  )
}
