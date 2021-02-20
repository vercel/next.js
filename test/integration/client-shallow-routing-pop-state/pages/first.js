import Link from 'next/link'

export default function Page({ now }) {
  return (
    <>
      <p id="now">{now}</p>
      <br />
      <Link href="/another">
        <a id="to-another">to /another</a>
      </Link>
    </>
  )
}

export const getServerSideProps = () => {
  return {
    props: {
      now: Date.now(),
    },
  }
}
