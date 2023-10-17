import Link from 'next/link'

const Another = () => (
  <div>
    <Link href="/?another=hello%2B" id="hello-plus">
      Hello +
    </Link>
    <br />
    <Link
      href={{ pathname: '/', query: { complex: 'yes+' } }}
      id="hello-complex"
    >
      Hello Complex
    </Link>
  </div>
)

export default Another
