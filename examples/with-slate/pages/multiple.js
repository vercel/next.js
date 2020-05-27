import Link from 'next/link'
import Editor from '../components/NextEditor'

const MultipleEditors = () => {
  return (
    <>
      <Link href="/">
        <a>Go to Home</a>
      </Link>
      <hr />
      <Editor slateKey="foo" defaultValue="Foo" />
      <hr />
      <Editor slateKey="bar" defaultValue="Bar" />
    </>
  )
}

export default MultipleEditors
