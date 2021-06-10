import Link from 'next/link'

export default function SomePage({ message }) {
  return (
    <main>
      <h1>Hello {message}</h1>
      <Link href="/some-other-page?redirect=/&message=refreshed">
        <a id="link-with-rewritten-url" className={message}>
          Link with rewritten target url
        </a>
      </Link>
      <Link href="/some-other-page?redirect=/some-page">
        <a>Link with client side navigation</a>
      </Link>
    </main>
  )
}

export const getServerSideProps = ({ query }) => ({
  props: { message: query.message || 'World ' },
})
