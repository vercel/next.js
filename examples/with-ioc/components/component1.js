import React from 'react'
import Component2 from './component2'

export default () => (
  <div
    style={{ marginTop: '5px', border: '1px dotted #ff0000', padding: '10px' }}
  >
    <h3>Component1</h3>
    Knows nothing about any custom `Link` or `Router` components or prop
    <Component2 />
  </div>
)
