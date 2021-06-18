import React from 'preact/compat'
import World from 'esm-package/entry'

export function getServerSideProps() {
  return {}
}

export default function Index(props) {
  return <div>Hello {World}</div>
}
