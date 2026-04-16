import * as React from 'react'
import { connection } from 'next/server'
import { FormWithArg, Form, UnrecognizedActionBoundary } from './client'

const action = async (...args: any[]) => {
  'use server'
  console.log('hello from server', ...args)
  return 'state-from-server'
}

// simulate client-side version skew by changing the action ID to something the server won't recognize
setServerActionId(action, 'decafc0ffeebad01')

export default async function Page() {
  // Opt out of static prerender: the fake $$id above is only meaningful at
  // runtime, and with prefetch inlining enabled, build-time prerender would
  // try to serialize the action reference into the prefetch payload and fail
  // to resolve the id in the server manifest.
  await connection()

  return (
    <div>
      <div>
        <UnrecognizedActionBoundary>
          <Form action={action} />
        </UnrecognizedActionBoundary>
      </div>
      <div>
        <UnrecognizedActionBoundary>
          <FormWithArg
            action={action}
            id="form-simple-argument"
            argument={{ foo: 'bar' }}
          >
            Submit client form with simple argument
          </FormWithArg>
        </UnrecognizedActionBoundary>
      </div>
      <div>
        <UnrecognizedActionBoundary>
          <FormWithArg
            action={action}
            id="form-complex-argument"
            argument={new Map([['foo', Promise.resolve('bar')]])}
          >
            Submit client form with complex argument
          </FormWithArg>
        </UnrecognizedActionBoundary>
      </div>
    </div>
  )
}

function setServerActionId(action: (...args: any[]) => any, id: string) {
  // React implementation detail: `registerServerReference(func, id)` sets `func.$$id = id`.
  const actionWithMetadata = action as typeof action & { $$id?: string }
  if (!actionWithMetadata.$$id) {
    throw new Error(
      `Expected to find server action metadata properties on ${action}`
    )
  }
  Object.defineProperty(actionWithMetadata, '$$id', {
    value: id,
    configurable: true,
  })
}
