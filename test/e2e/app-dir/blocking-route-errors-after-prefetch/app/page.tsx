import { redirect } from 'next/navigation'
import { LinkAccordion } from '../components/link-accordion'

const hrefs = [
  '/dynamic',
  '/redirect',
  '/missing',
  '/throws',
  '/dynamic-viewport',
]

export default function Page() {
  return (
    <>
      <h1 id="home">Home</h1>
      <ul>
        {hrefs.map((href) => (
          <li key={href}>
            <LinkAccordion href={href}>{href}</LinkAccordion>
          </li>
        ))}
      </ul>
      <form
        action={async () => {
          'use server'
          redirect('/redirect')
        }}
      >
        <button id="redirect-from-action">Redirect from a Server Action</button>
      </form>
    </>
  )
}
