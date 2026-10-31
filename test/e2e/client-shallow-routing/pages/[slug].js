import Link from 'next/link'

export default function Page(props) {
  return (
    <>
      <p id="props">{JSON.stringify(props)}</p>
      <Link href="/first?a=b" shallow id="add-query-shallow">
        add query shallow
      </Link>
      <br />
      <Link href="/first" shallow id="remove-query-shallow">
        remove query shallow
      </Link>
      <br />
      <Link href="/another" id="to-another">
        to /another non-shallow
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
