import React from 'preact/compat'
import World1 from 'esm-package1/entry'
import World2 from 'esm-package2/entry'
import World3 from 'invalid-esm-package/entry'

const worlds = 'World+World+World'

export default function Index() {
  return (
    <div>
      Hello {World1}+{World2}+{World3}+{worlds}
    </div>
  )
}
