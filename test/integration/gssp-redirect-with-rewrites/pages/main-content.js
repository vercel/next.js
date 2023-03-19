import Link from 'next/link'

export default function MainContent({ message }) {
  return (
    <main>
      <h1>Hello {message}</h1>

      <ul>
        <li>
          <Link
            href="/redirector?redirect=/alias-to-main-content&message=refreshed"
            id="link-with-rewritten-url"
            className={message}
          >
            Link with rewritten target url
          </Link>
        </li>

        <li>
          <Link href="/redirector?redirect=/main-content&message=refreshWithClientSideNavigation">
            Link with client side navigation
          </Link>
        </li>

        <li>
          <Link
            href="/redirector?redirect=/unknown-route"
            id="link-unknown-url"
          >
            Link to unknown internal navigation
          </Link>
        </li>
      </ul>
    </main>
  )
}

export const getServerSideProps = ({ query }) => ({
  props: { message: query.message || 'World ' },
})
