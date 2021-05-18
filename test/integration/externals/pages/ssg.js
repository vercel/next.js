import React from 'preact/compat'
import World from 'esm-package/entry'

export async function getStaticProps() {
  return {
    props: {},
  }
}

export default function Index(props) {
  return <div>Hello {World}</div>
}
