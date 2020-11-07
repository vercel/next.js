import Link from 'next/link'

export default function Page(props) {
  return (
    <>
      <p id="props">{JSON.stringify(props)}</p>
      <Link href="/first?a=b" shallow>
        <a id="add-query-shallow">add query shallow</a>
      </Link>
      <br />
      <Link href="/first" shallow>
        <a id="remove-query-shallow">remove query shallow</a>
      </Link>
      <br />
      <Link href="/another">
        <a id="to-another">to /another non-shallow</a>
      </Link>
    </>
  )
}

export const getServerSideProps = ({ params }) => {
  return {
    props: {
      params,
      random: Math.random(),
    },
  }
}
