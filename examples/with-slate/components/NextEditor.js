import React, { useState } from 'react'
import Plain from 'slate-plain-serializer'
import { Editor } from 'slate-react'
import useCustomKeygen from '../lib/useCustomKeygen'

const NextEditor = ({ slateKey, defaultValue, ...props }) => {
  useCustomKeygen(slateKey)
  const [state, setState] = useState(() => Plain.deserialize(defaultValue))

  return (
    <Editor
      placeholder='Enter some plain text...'
      value={state}
      onChange={({ value }) => setState(value)}
    />
  )
}

export default NextEditor
