import React from 'react'

// eslint-disable-next-line camelcase
export async function getServerSideProps() {
  return {
    props: {
      world: 'world',
      time: new Date().getTime(),
    },
  }
}

export default ({ world, time }) => {
  return (
    <>
      <p>hello: {world}</p>
      <span>time: {time}</span>
    </>
  )
}
