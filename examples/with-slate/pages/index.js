import Link from 'next/link'
import NextEditor from '../components/NextEditor'

const IndexPage = (props) => {
  return (
    <>
      <Link href="/multiple">
        <a>Go to multiple</a>
      </Link>
      <hr />
      <NextEditor
        slateKey="someUniqueKey"
        defaultValue="This is editable plain text, just like a <textarea>!"
      />
    </>
  )
}

export default IndexPage
