import Link from 'next/link'

const Another = () => (
  <div>
    <Link href="/?another=hello%25" id="hello-percent">
      Hello %
    </Link>
    <br />
    <Link
      href={{ pathname: '/', query: { complex: 'yes%' } }}
      id="hello-complex"
    >
      Hello Complex
    </Link>
  </div>
)

export default Another
