import React from 'react'

const Test1 = () => <h1>Client Test 1</h1>

Test1.getInitialProps = () => {
  throw new Error('Client Test 1')
}

export default Test1
