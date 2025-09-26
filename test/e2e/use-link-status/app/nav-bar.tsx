'use client'

import React from 'react'
import Link from 'next/link'
import { useLinkStatus } from 'next/link'
import { navigateByServerAction } from './server-action'
import { useRouter } from 'next/navigation'

export default function NavBar() {
  const postIds = Array.from({ length: 5 }, (_, i) => i + 1)
  const router = useRouter()

  return (
    <nav data-testid="navbar">
      <ul style={{ display: 'flex', listStyle: 'none', gap: '10px' }}>
        <li>
          <Link
            prefetch={false}
            href="/"
            id="home-link"
            data-testid="home-link"
          >
            Home <LoadingIndicator id="home" />
          </Link>
          <button
            id="server-action-home-btn"
            data-testid="server-action-home-btn"
            onClick={() => navigateByServerAction(`/`)}
          >
            Navigate by server action to home
          </button>
        </li>
        {postIds.map((id) => (
          <li key={id}>
            <Link
              prefetch={false}
              href={`/post/${id}`}
              id={`post-${id}-link`}
              data-testid={`post-${id}-link`}
            >
              Post {id} <LoadingIndicator id={`post-${id}`} />
            </Link>
            <button
              id={`server-action-${id}-btn`}
              data-testid={`server-action-${id}-btn`}
              onClick={() => navigateByServerAction(`/post/${id}`)}
            >
              Navigate by server action to {id}
            </button>
            <button
              id={`router-push-${id}-btn`}
              data-testid={`router-push-${id}-btn`}
              onClick={() => router.push(`/post/${id}`)}
            >
              Navigate by Router.push to {id}
            </button>
          </li>
        ))}

        <button
          id="enable-debug-btn"
          data-testid="enable-debug-btn"
          onClick={() => {
            const urlSearchParams = new URLSearchParams(window.location.search)
            urlSearchParams.set('debug', '1')
            window.history.pushState(null, '', `?${urlSearchParams.toString()}`)
          }}
        >
          Enable Debug Mode
        </button>

        <button
          id="disable-debug-btn"
          data-testid="disable-debug-btn"
          onClick={() => {
            const urlSearchParams = new URLSearchParams(window.location.search)
            urlSearchParams.delete('debug')
            window.history.pushState(null, '', `?${urlSearchParams.toString()}`)
          }}
        >
          Disable Debug Mode
        </button>

        <LinkThatChangesHref />
      </ul>
    </nav>
  )
}

const LoadingIndicator = ({ id }: { id: string }) => {
  const { pending } = useLinkStatus()

  if (pending) {
    return (
      <div id={`${id}-loading`} data-testid={`${id}-loading`}>
        (Loading)
      </div>
    )
  }

  return null
}

const LinkThatChangesHref = () => {
  const [postId, setPostId] = React.useState(6)

  return (
    <div>
      <Link href={`/post/${postId}`} data-testid="changing-link">
        Link to post {postId} <LoadingIndicator id={`post-${postId}`} />
      </Link>
      <button
        onClick={() => setPostId(postId + 1)}
        data-testid="increment-link-btn"
      >
        Change link target
      </button>
    </div>
  )
}
