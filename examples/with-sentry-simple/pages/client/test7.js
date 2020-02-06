import React from 'react'

const Test7 = () => {
  React.useEffect(function() {
    async function doTest() {
      const doAsyncWork = () => Promise.reject(new Error('Client Test 7'))
      const result = await doAsyncWork()
      console.log(result)
    }
    doTest()
  }, [])

  return <h1>Client Test 7</h1>
}

export default Test7
