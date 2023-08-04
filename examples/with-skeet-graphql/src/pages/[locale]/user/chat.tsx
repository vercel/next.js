import { ReactElement, Suspense, useCallback, useEffect } from 'react'
import UserLayout from '@/layouts/user/UserLayout'
import siteConfig from '@/config/site'
import { getStaticPaths, makeStaticProps } from '@/lib/getStatic'
import ChatScreen, {
  chatScreenQuery,
} from '@/components/pages/user/chat/ChatScreen'
import UserScreenLoading from '@/components/loading/UserScreenLoading'
import UserScreenErrorBoundary from '@/components/error/UserScreenErrorBoundary'
import {
  ChatScreenQuery,
  ChatScreenQuery$variables,
} from '@/__generated__/ChatScreenQuery.graphql'
import { useQueryLoader } from 'react-relay'
import { sleep } from '@/utils/time'
import RefetchChat from '@/components/pages/user/chat/RefetchChat'

const seo = {
  pathname: '/user/chat',
  title: {
    ja: 'AIチャット',
    en: 'AI Chat',
  },
  description: {
    ja: siteConfig.descriptionJA,
    en: siteConfig.descriptionEN,
  },
  img: null,
}

const getStaticProps = makeStaticProps(['common', 'user', 'chat'], seo)
export { getStaticPaths, getStaticProps }

export default function Chat() {
  const [queryReference, loadQuery] =
    useQueryLoader<ChatScreenQuery>(chatScreenQuery)

  useEffect(() => {
    ;(async () => {
      await sleep(250)
      loadQuery({
        first: 15,
        after: null,
      })
    })()
  }, [loadQuery])

  const refetch = useCallback(
    (variables: ChatScreenQuery$variables) => {
      loadQuery(variables, { fetchPolicy: 'network-only' })
    },
    [loadQuery]
  )

  if (queryReference == null) {
    return (
      <>
        <UserScreenLoading />
      </>
    )
  }
  return (
    <>
      <div className="content-height">
        <Suspense fallback={<UserScreenLoading />}>
          <UserScreenErrorBoundary
            showRetry={<RefetchChat refetch={refetch} />}
          >
            <ChatScreen queryReference={queryReference} refetch={refetch} />
          </UserScreenErrorBoundary>
        </Suspense>
      </div>
    </>
  )
}

Chat.getLayout = function getLayout(page: ReactElement) {
  return <UserLayout>{page}</UserLayout>
}
