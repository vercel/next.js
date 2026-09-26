import { Suspense } from 'react'
import { headers } from 'next/headers'
import { ConsumeRemoteComponent } from 'remote-components/host/nextjs/app'
import { GracefulErrorBoundary } from '../graceful-error-boundary'
import { SingletonDisplay } from '../singleton-display'

export default function PkgHome() {
  return (
    <>
      <SingletonDisplay />
      <GracefulErrorBoundary>
        <Suspense fallback={null}>
          <RemoteSingleton />
        </Suspense>
      </GracefulErrorBoundary>
    </>
  )
}

async function RemoteSingleton() {
  const host = (await headers()).get('host')
  return (
    <ConsumeRemoteComponent
      src={`http://${host}/rc-component/singleton`}
      isolate={false}
    />
  )
}
