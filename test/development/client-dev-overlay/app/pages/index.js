import React from 'react'

// Create a runtime error.
if ('window' in global) {
  throw Error('example runtime error')
}

const Page = () => {
  return <div>client-react-dev-overlay</div>
}

export default Page
