import React from 'react'
import Plain from 'slate-plain-serializer'
import { KeyUtils } from 'slate'
import { Editor } from 'slate-react'

class CustomKeygenEditor extends React.Component {
  constructor (props) {
    super(props)
    let key = 0
    const keygen = () => {
      key += 1
      return props.uniqueId + key // custom keys
    }
    KeyUtils.setGenerator(keygen)
    this.initialValue = Plain.deserialize(props.content)
  }
  render () {
    return (
      <Editor
        placeholder='Enter some plain text...'
        defaultValue={this.initialValue}
        style={this.props.style}
      />
    )
  }
}

export default CustomKeygenEditor
