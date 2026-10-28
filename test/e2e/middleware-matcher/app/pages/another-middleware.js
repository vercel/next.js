import Link from 'next/link'

export default function Page(props) {
  return (
    <div>
      <p id="another-middleware">This should also run the middleware</p>
      <p id="props">{JSON.stringify(props)}</p>
      <Link href="/" id="to-index">
        to /
      </Link>
      <br />
    </div>
  )
}

export const getServerSideProps = () => {
  return {
    props: {
      message: 'Hello, magnificent world.',
    },
  }
}
