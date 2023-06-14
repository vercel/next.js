import React from 'react'

export default function EdgePage() {
  return <div>Edge Page</div>
}

export const config = {
  runtime: 'experimental-edge',
}

export function getServerSideProps() {
  return {
    props: {},
  }
}
