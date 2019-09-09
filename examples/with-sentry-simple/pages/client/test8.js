import React from 'react'

const Test8 = () => {
  React.useEffect(async () => {
    const doAsyncWork = () => Promise.reject(new Error('Client Test 8'))
    const result = await doAsyncWork()
    console.log(result)
  }, [])

  return (
    <React.Fragment>
      <h1>Client Test 8</h1>
      <button
        onClick={() => {
          throw new Error('Client Test 8')
        }}
      >
        Click me to throw an Error
      </button>
    </React.Fragment>
  )
}

export default Test8