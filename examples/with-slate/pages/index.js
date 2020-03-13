import React from 'react'
import Link from 'next/link'
import NextEditor from '../components/NextEditor'

const IndexPage = props => {
  return (
    <React.Fragment>
      <Link href="/multiple">
        <a>Go to multiple</a>
      </Link>
      <hr />
      <NextEditor
        slateKey="someUniqueKey"
        defaultValue="This is editable plain text, just like a <textarea>!"
      />
    </React.Fragment>
  )
}

export default IndexPage
