'use client'

import * as features from '../../lib/features'

export default function Client() {
  return (
    <p>
      {Object.values(features)
        .map((fn) => fn(0))
        .join('|')}
    </p>
  )
}
