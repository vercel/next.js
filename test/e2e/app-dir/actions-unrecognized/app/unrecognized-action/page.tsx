import * as React from 'react'
import { ClientForm, ServerForm, UnrecognizedActionBoundary } from './client'

const action = async (...args: any[]) => {
  'use server'
  console.log('hello from server', ...args)
  return 'state-from-server'
}

// simulate client-side version skew by changing the action ID to something the server won't recognize
setServerActionId(action, 'decafc0ffeebad01')

export default function Page() {
  return (
    <div>
      <div>
        <UnrecognizedActionBoundary>
          <ServerForm action={action} />
        </UnrecognizedActionBoundary>
      </div>
      <div>
        <UnrecognizedActionBoundary>
          <ClientForm
            action={action}
            id="client-form-simple-argument"
            argument={{ foo: 'bar' }}
          >
            Submit client form with simple argument
          </ClientForm>
        </UnrecognizedActionBoundary>
      </div>
      <div>
        <UnrecognizedActionBoundary>
          <ClientForm
            action={action}
            id="client-form-complex-argument"
            argument={new Map([['foo', Promise.resolve('bar')]])}
          >
            Submit client form with complex argument
          </ClientForm>
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
