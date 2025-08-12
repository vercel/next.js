import React from 'react'

// eslint-disable-next-line camelcase
export async function getStaticProps() {
  return {
    props: {
      world: 'world',
      random: Math.random() + Date.now(),
      time: new Date().getTime(),
    },
    revalidate: 1,
  }
}

export default ({ world, time, random }) => {
  return (
    <>
      <p id="hello">hello: {world}</p>
      <span id="time">time: {time}</span>
      <span id="random">random: {random}</span>
    </>
  )
}
