import Link from 'next/link'

function aLink (props) {
  return (
    <div>
      <h3>A Link page!</h3>
      <Link href='/'>Go to /</Link>
    </div>
  )
}

aLink.getInitialProps = () => ({})

export default aLink
