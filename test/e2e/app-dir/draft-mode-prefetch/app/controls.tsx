'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  disableDraftMode,
  enableDraftMode,
  enableDraftModeAndRedirect,
  unrelatedAction,
} from './actions'
import { LinkAccordion } from './link-accordion'

export function Controls() {
  const router = useRouter()
  const [actionResult, setActionResult] = useState<string | null>(null)

  return (
    <>
      <form action={enableDraftMode}>
        <button id="enable-draft-mode">Enable draft mode</button>
      </form>
      <form action={disableDraftMode}>
        <button id="disable-draft-mode">Disable draft mode</button>
      </form>
      <button
        id="disable-with-catch"
        onClick={async () => {
          try {
            await disableDraftMode()
          } catch {
            setActionResult('Action response failed')
          }
        }}
      >
        Disable draft mode and catch errors
      </button>
      <form action={enableDraftModeAndRedirect}>
        <button id="enable-and-redirect">Enable draft mode and redirect</button>
      </form>
      <button
        id="unrelated-action"
        onClick={async () => setActionResult(await unrelatedAction())}
      >
        Run unrelated action
      </button>
      <p id="action-result">{actionResult}</p>
      <div>
        <LinkAccordion href="/article/foreground" prefetch={false}>
          Navigate without prefetching
        </LinkAccordion>
      </div>
      <div>
        <LinkAccordion href="/article/auto">Auto target</LinkAccordion>
      </div>
      <div>
        <LinkAccordion href="/article/full" prefetch={true}>
          Full target
        </LinkAccordion>
      </div>
      <div>
        <LinkAccordion href="/article/retained" prefetch={true}>
          Retained target
        </LinkAccordion>
      </div>
      <button
        id="router-prefetch"
        onClick={() => router.prefetch('/article/imperative')}
      >
        Prefetch imperative target
      </button>
      <fieldset>
        <legend>Queued prefetches</legend>
        {Array.from({ length: 9 }, (_, index) => (
          <div key={index}>
            <LinkAccordion href={`/article/queued-${index}`} prefetch={true}>
              Queued target {index}
            </LinkAccordion>
          </div>
        ))}
      </fieldset>
    </>
  )
}
