'use client'

import { useState } from 'react'
import {
  revalidateLayoutByTagExpireNowAction,
  revalidateLayoutByTagLegacyAction,
  revalidateLayoutByTagMaxAction,
} from '../app/revalidate-actions'

type ApiRevalidateMode =
  | 'tag-layout-expireNow'
  | 'tag-layout-max'
  | 'tag-layout-legacy'
  | 'path-root-layout'
  | 'path-team-layout'
  | 'path-team-page'
type ServerActionMode =
  | 'server-action-tag-layout-expireNow'
  | 'server-action-tag-layout-max'
  | 'server-action-tag-layout-legacy'

export function RevalidateControls() {
  const [result, setResult] = useState('idle')
  const [isPending, setIsPending] = useState(false)

  const runApiRevalidate = async (mode: ApiRevalidateMode) => {
    setIsPending(true)
    try {
      const response = await fetch(`/api/revalidate-layout?mode=${mode}`, {
        method: 'GET',
      })
      const data = await response.json()
      setResult(JSON.stringify(data))
    } catch (error) {
      setResult(
        JSON.stringify({
          error: error instanceof Error ? error.message : 'unknown error',
          mode,
        })
      )
    } finally {
      setIsPending(false)
    }
  }

  const runServerActionRevalidate = async (mode: ServerActionMode) => {
    setIsPending(true)
    try {
      const data =
        mode === 'server-action-tag-layout-expireNow'
          ? await revalidateLayoutByTagExpireNowAction()
          : mode === 'server-action-tag-layout-max'
            ? await revalidateLayoutByTagMaxAction()
            : await revalidateLayoutByTagLegacyAction()
      setResult(JSON.stringify(data))
    } catch (error) {
      setResult(
        JSON.stringify({
          error: error instanceof Error ? error.message : 'unknown error',
          mode,
        })
      )
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div data-revalidate-controls="true">
      <button
        id="revalidate-in-browser-tag-layout-expireNow"
        type="button"
        disabled={isPending}
        onClick={() => runApiRevalidate('tag-layout-expireNow')}
      >
        Browser Revalidate Tag Layout (expireNow)
      </button>
      <button
        id="revalidate-in-browser-tag-layout-max"
        type="button"
        disabled={isPending}
        onClick={() => runApiRevalidate('tag-layout-max')}
      >
        Browser Revalidate Tag Layout (max)
      </button>
      <button
        id="revalidate-in-browser-tag-layout-legacy"
        type="button"
        disabled={isPending}
        onClick={() => runApiRevalidate('tag-layout-legacy')}
      >
        Browser Revalidate Tag Layout (legacy)
      </button>
      <button
        id="revalidate-in-browser-server-action-tag-layout-expireNow"
        type="button"
        disabled={isPending}
        onClick={() =>
          runServerActionRevalidate('server-action-tag-layout-expireNow')
        }
      >
        Server Action Revalidate Tag Layout (expireNow)
      </button>
      <button
        id="revalidate-in-browser-server-action-tag-layout-max"
        type="button"
        disabled={isPending}
        onClick={() =>
          runServerActionRevalidate('server-action-tag-layout-max')
        }
      >
        Server Action Revalidate Tag Layout (max)
      </button>
      <button
        id="revalidate-in-browser-server-action-tag-layout-legacy"
        type="button"
        disabled={isPending}
        onClick={() =>
          runServerActionRevalidate('server-action-tag-layout-legacy')
        }
      >
        Server Action Revalidate Tag Layout (legacy)
      </button>
      <div id="revalidate-result" data-revalidate-result={result}>
        {result}
      </div>
    </div>
  )
}
