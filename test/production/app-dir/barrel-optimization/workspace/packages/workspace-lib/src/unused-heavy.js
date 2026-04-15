import React from 'react'

// This is intentionally "heavy" - if barrel optimization works, this module
// should not be included in the bundle when only Button is imported.
const LARGE_DATA = Array.from({ length: 1000 }, (_, i) => `unused_item_${i}`)

export function UnusedHeavy() {
  return React.createElement('div', null, LARGE_DATA.join(','))
}
