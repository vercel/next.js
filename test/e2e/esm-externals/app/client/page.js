'use client'

import World1 from 'app-esm-package1/entry'
import World2 from 'app-esm-package2/entry'
import World3 from 'app-cjs-esm-package/entry'

export default function Index() {
  return (
    <p>
      Hello {World1}+{World2}+{World3}
    </p>
  )
}
