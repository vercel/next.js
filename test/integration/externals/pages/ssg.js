import React from 'preact/compat'
import World1 from 'esm-package/entry'
import World2 from 'module-package'

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
