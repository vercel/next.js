import Link from 'next/link'

const Another = () => (
  <div>
    <Link href="/?another=hello%20">
      <a id="hello-space">Hello Space</a>
    </Link>
    <br />
    <Link href={{ pathname: '/', query: { complex: 'yes ' } }}>
      <a id="hello-complex">Hello Complex</a>
    </Link>
  </div>
)

export default Another
