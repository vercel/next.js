import React, { type JSX } from 'react'

import { World } from 'components/world'

// External
import { Counter } from '../../shared/components/counter'

export default function HelloPage(): JSX.Element {
  return (
    <div>
      Hello <World />!
      <br />
      <Counter />
    </div>
  )
}
