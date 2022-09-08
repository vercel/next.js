// bar/page.js should work with client hook
'client'

import { useState } from 'react'

export default function page() {
  const [text] = useState('bar:client-entry + client:useState')
  return <div>{text}</div>
}
