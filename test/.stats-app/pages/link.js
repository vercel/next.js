import Link from 'next/link'

function aLink(props) {
  return (
    <div>
      <h3>A Link page!</h3>
      <Link href="/">Go to /</Link>
    </div>
  )
}

// we add getServerSideProps to prevent static optimization
// to allow us to compare server-side changes
export const getServerSideProps = () => {
  return {
    props: {},
  }
}

export default aLink
