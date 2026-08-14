import { forbidden, notFound, redirect, unauthorized } from 'next/navigation'
import { Suspense } from 'react'
import { LinkAccordion } from '../../link-accordion'
import './styles.css'

type Props = {
  params: Promise<{ case: string }>
}

const cases = [
  'success',
  'other',
  'render-error',
  'not-found',
  'forbidden',
  'unauthorized',
  'metadata-error',
  'metadata-not-found',
  'metadata-forbidden',
  'metadata-unauthorized',
  'metadata-redirect',
]

export async function generateMetadata({ params }: Props) {
  const routeCase = (await params).case

  switch (routeCase) {
    case 'metadata-error':
      throw new Error('metadata failed')
    case 'metadata-not-found':
      return notFound()
    case 'metadata-forbidden':
      return forbidden()
    case 'metadata-unauthorized':
      return unauthorized()
    case 'metadata-redirect':
      return redirect('/success')
    default:
      return { title: `Named slot: ${routeCase}` }
  }
}

export default function Page(props: Props) {
  return (
    <Suspense fallback={<p id="loading">Loading named slot</p>}>
      <PageContent {...props} />
    </Suspense>
  )
}

async function PageContent({ params }: Props) {
  const routeCase = (await params).case

  switch (routeCase) {
    case 'render-error':
      throw new Error('render failed')
    case 'not-found':
      return notFound()
    case 'forbidden':
      return forbidden()
    case 'unauthorized':
      return unauthorized()
    default:
      return (
        <section>
          <p id="named-slot-page">Named slot page: {routeCase}</p>
          <nav>
            {cases.map((name) => (
              <LinkAccordion key={name} id={name} href={`/${name}`}>
                {name}
              </LinkAccordion>
            ))}
          </nav>
        </section>
      )
  }
}
