import React from 'react'
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
      <Editor
        placeholder='Enter some plain text...'
        value={this.state.value}
        onChange={this.onChange}
      />
    )
  }

  onChange = ({ value }) => {
    this.setState({ value })
  }
}

export default Index
