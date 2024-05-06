import 'server-only'
import React from 'react'

export default function handler(req, res) {
  if (React.useState) {
    throw new Error('React.useState should not be defined in server layer')
  }
  return res.send('pages/api/hello.js:')
}
