import React from 'react'

export async function getServerSideProps({ res }) {
  res.setHeader('Cache-Control', 'public, max-age=3600')
  return {
    props: { world: 'world' },
  }
}

export default ({ world }) => {
  return <p>hello: {world}</p>
}
