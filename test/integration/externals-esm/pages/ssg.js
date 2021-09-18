import React from 'preact/compat'
import World1 from 'esm-package1/entry'
import World2 from 'esm-package2/entry'

export async function getStaticProps() {
  return {
    props: {},
  }
}

export default function Index(props) {
  return (
    <div>
      Hello {World1}+{World2}
    </div>
  )
}
