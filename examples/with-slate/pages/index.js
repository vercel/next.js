import React from 'react'
import Link from 'next/link'
import Plain from 'slate-plain-serializer'
import { Editor } from 'slate-react'
import { KeyUtils } from 'slate'

class Index extends React.Component {
  constructor (props) {
    super(props)

    // In order to allow ssr we need to reset the key
    // generating function to its initial state.
    KeyUtils.resetGenerator()

    // Deserialize the initial editor value.
    this.state = {
      value: Plain.deserialize(
        'This is editable plain text, just like a <textarea>!'
      )
    }
  }

  render () {
    return (
      <React.Fragment>
        <Link href='/multiple'>
          <a>Go to multiple</a>
        </Link>
        <Editor
          placeholder='Enter some plain text...'
          value={this.state.value}
          onChange={this.onChange}
        />
      </React.Fragment>
    )
  }

  onChange = ({ value }) => {
    this.setState({ value })
  }
}

export default Index
