'use client'

import Script from 'next/script'

function Embed({ id }: { id: string }) {
  return (
    <Script
      src="/shared-script.js"
      onLoad={() => {
        const scope = window as any
        scope.sharedScriptOnLoadCalls ??= []
        scope.sharedScriptOnLoadCalls.push(id)
      }}
      onReady={() => {
        const scope = window as any
        scope.sharedScriptOnReadyCalls ??= []
        scope.sharedScriptOnReadyCalls.push({
          id,
          evaluations: scope.sharedScriptEvaluations ?? 0,
        })
      }}
    />
  )
}

export default function Page() {
  return (
    <>
      <Embed id="a" />
      <Embed id="b" />
      <Embed id="c" />
    </>
  )
}
