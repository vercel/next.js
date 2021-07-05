import React from 'react'

export async function getServerSideProps({ res }) {
  res.setHeader('Cache-Control', 'public, max-age=3600')
  return {
    props: { world: 'world' },
  }
}

const CustomCache = ({ world }) => {
  return <p>hello: {world}</p>
}

export default CustomCache
