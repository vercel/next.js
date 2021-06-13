import Link from 'next/link'

export default function MainContent({ message }) {
  return (
    <main>
      <h1>Hello {message}</h1>
      <Link href="/redirector?redirect=/alias-to-main-content&message=refreshed">
        <a id="link-with-rewritten-url" className={message}>
          Link with rewritten target url
        </a>
      </Link>
      <Link href="/redirector?redirect=/main-content&message=refreshWithClientSideNavigation">
        <a>Link with client side navigation</a>
      </Link>
    </main>
  )
}

export const getServerSideProps = ({ query }) => ({
  props: { message: query.message || 'World ' },
})
