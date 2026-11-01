import { connection } from 'next/server'
import { Suspense } from 'react'
import { LinkAccordion } from '../../../../components/link-accordion'

export default function Page({
  params,
}: {
  params: Promise<{ top: string; step: string }>
}) {
  return (
    <main>
      <Suspense fallback={<p>Loading hub...</p>}>
        <Hub params={params} />
      </Suspense>
    </main>
  )
}

async function Hub({
  params,
}: {
  params: Promise<{ top: string; step: string }>
}) {
  await connection()
  const { top, step } = await params

  return (
    <>
      <h1>{`Fallback params hub ${step}`}</h1>
      <div>
        <LinkAccordion
          href={`/required-fallback-params/${top}/b1`}
          prefetch={false}
        >
          Required fallback shell
        </LinkAccordion>
      </div>
      <div>
        <LinkAccordion
          href={`/required-fallback-params/${top}/b2`}
          prefetch={false}
        >
          Required fallback shell, other bottom
        </LinkAccordion>
      </div>
      <div>
        <LinkAccordion href={`/fully-static-params/${top}`} prefetch={false}>
          Fully static page
        </LinkAccordion>
      </div>
      <div>
        <LinkAccordion
          href={`/partial-fully-static-params/${top}`}
          prefetch={false}
        >
          Fully static page with Partial Prefetching
        </LinkAccordion>
      </div>
      {top === 'time' ? (
        <LinkAccordion
          href="/fully-static-params/time#full-prefetch"
          prefetch={true}
        >
          Full prefetch
        </LinkAccordion>
      ) : null}
    </>
  )
}
