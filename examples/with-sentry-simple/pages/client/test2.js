import React from 'react'

const Test2 = () => <h1>Client Test 2</h1>

Test2.getInitialProps = () => Promise.reject(new Error('Client Test 2'))

export default Test2
