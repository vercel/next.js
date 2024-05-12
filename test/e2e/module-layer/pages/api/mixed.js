// import '../../lib/mixed-lib'
import { externalValue } from 'external-lib'

import React from 'react'

export default function handler(req, res) {
  if (Object(React).useState) {
    throw new Error('React.useState should not be available')
  }
  return res.send('pages/api/mixed.js:' + externalValue)
}
