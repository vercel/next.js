import React from 'react'
import { workAsyncStorage } from '../app-render/work-async-storage.external'
import { afterTaskAsyncStorage } from '../app-render/after-task-async-storage.external'
import { CaptureStackTrace } from './stitch-after-callstack'

export type AfterTask<T = unknown> = Promise<T> | AfterCallback<T>
export type AfterCallback<T = unknown> = () => T | Promise<T>

/**
 * This function allows you to schedule callbacks to be executed after the current request finishes.
 */
export function after<T>(task: AfterTask<T>): void {
  const workStore = workAsyncStorage.getStore()

  if (!workStore) {
    // TODO(after): the linked docs page talks about *dynamic* APIs, which after soon won't be anymore
    throw new Error(
      '`after` was called outside a request scope. Read more: https://nextjs.org/docs/messages/next-dynamic-api-wrong-context'
    )
  }

  const { afterContext } = workStore

  // Capture the owner stack.
  // We need to do it here -- for some reason it doesn't work when called from inside `AfterContext`.
  // Owner stacks only work with experimental React (`experimental.reactOwnerStack`) and only in development.
  // (also, we want to DCE out the react import in production bundles, e.g. for middleware)
  let reactOwnerStack: string | null = null
  if (process.env.NODE_ENV === 'development') {
    //  Skip it if we're already in an `after` task, where there's definitely no owner stack to capture
    if (!afterTaskAsyncStorage.getStore()) {
      reactOwnerStack = React.captureOwnerStack?.()
    }
  }

  // Capture the caller stack here, to avoid showing any internals
  // Note that we're gonna stitch the stack both in dev and prod.
  const callerStack = new CaptureStackTrace()

  return afterContext.after(task, {
    callerStack,
    reactOwnerStack,
  })
}
