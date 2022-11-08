import React, { useEffect } from 'react'
const helloWorld = 'hello world'

class MyComp extends React.Component {
  render() {
    return <h1>Hello World</h1>
  }
}

export default function Page() {
  useEffect(() => {
    ;(async () => {
      console.log(helloWorld)
    })()
  }, [])
  return (
    <>
      {helloWorld}
      <MyComp />
    </>
  )
}
