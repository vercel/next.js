import Link from 'next/link'

const Another = () => (
  <div>
    <Link href="/?another=hello%0A" id="hello-lf">
      Hello LF
    </Link>
    <br />
    <Link
      href={{ pathname: '/', query: { complex: 'yes\n' } }}
      id="hello-complex"
    >
      Hello Complex
    </Link>
  </div>
)

export default Another
