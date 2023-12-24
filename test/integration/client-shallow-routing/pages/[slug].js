import Link from 'next/link'

export default function Page(props) {
  return (
    <>
      <p id="props">{JSON.stringify(props)}</p>
      <Link href="/first?a=b" shallow id="add-query-shallow-to-first">
        add query shallow to first
      </Link>
      <br />
      <Link href="/first" shallow id="remove-query-shallow-to-first">
        remove query shallow to first
      </Link>
      <br />
      <Link href="/another" id="to-another">
        to /another non-shallow
      </Link>
      <Link
        href="/another?a=b"
        replace
        shallow
        id="add-query-shallow-to-another-by-replace"
      >
        add query shallow to another by replace
      </Link>
      <br />
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
