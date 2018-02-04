import React from 'react'
import Endpoint from './endpoint'
import EndButton from './endbutton'

export default () => (
  <div style={{ marginTop: '5px', border: '1px dashed #0000ff', padding: '10px' }}>
    <h3>Component2</h3>
    Knows nothing about any custom `Link` or `Router` components or prop
    <Endpoint />
    <EndButton />
  </div>
)
