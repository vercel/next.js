import React from 'preact/compat'
import World1 from 'esm-package1/entry'
import World2 from 'esm-package2/entry'
import World3 from 'invalid-esm-package/entry'

export function getServerSideProps() {
  return {
    props: {
      worlds: `${World1}+${World2}+${World3}`,
    },
  }
}

export default function Index({ worlds }) {
  return (
    <p>
      Hello {World1}+{World2}+{World3}+{worlds}
    </p>
  )
}
