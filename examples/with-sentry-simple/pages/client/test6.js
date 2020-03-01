import React from 'react'

const Test6 = () => {
  React.useEffect(() => {
    throw new Error('Client Test 6')
  }, [])

  return <h1>Client Test 6</h1>
}

export default Test6
