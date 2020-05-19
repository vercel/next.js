import React from 'react'

const doAsyncWork = () => Promise.reject(new Error('Client Test 4'))
doAsyncWork()

const Test4 = () => <h1>Client Test 4</h1>

export default Test4
