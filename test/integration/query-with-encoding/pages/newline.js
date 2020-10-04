import Link from 'next/link'

const Another = () => (
  <div>
    <Link href="/?another=hello%0A">
      <a id="hello-lf">Hello LF</a>
    </Link>
    <br />
    <Link href={{ pathname: '/', query: { complex: 'yes\n' } }}>
      <a id="hello-complex">Hello Complex</a>
    </Link>
  </div>
)

export default Another
