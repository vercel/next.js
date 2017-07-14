import React from 'react'
import preval from 'preval.macro'

const whoami = preval`
  const userInfo = require('os').userInfo()
  module.exports = userInfo.username
`

export default WhoAmI

function WhoAmI () {
  return (
    <div style={{display: 'flex', justifyContent: 'center'}}>
      <h1>
        <pre>
          whoami: {whoami}
        </pre>
      </h1>
    </div>
  )
}
