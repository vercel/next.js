import Link from 'next/link'

const Another = () => (
  <div>
    <Link href="/?another=hello%20" id="hello-space">
      Hello Space
    </Link>
    <br />
    <Link
      href={{ pathname: '/', query: { complex: 'yes ' } }}
      id="hello-complex"
    >
      Hello Complex
    </Link>
  </div>
)

export default Another
