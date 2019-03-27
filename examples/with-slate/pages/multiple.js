import React from 'react'
import Link from 'next/link'
import CustomKeygenEditor from './CustomKeygenEditor'

const content = {
  'first-editor':
    'This example shows how to have multiple instances of the editor.',
  'second-editor': 'Without a custom key generator, you could not focus here.'
}

class MultipleEditors extends React.Component {
  render () {
    return (
      <React.Fragment>
        <Link href='/'>
          <a>Go to Home</a>
        </Link>
        {Object.keys(content).map((key, idx) => (
          <CustomKeygenEditor
            key={idx}
            uniqueId={key}
            content={content[key]}
            style={{ margin: 20 }}
          />
        ))}
      </React.Fragment>
    )
  }
}

export default MultipleEditors
