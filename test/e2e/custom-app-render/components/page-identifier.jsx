import React from 'react'

export function PageIdentifier({ page }) {
  return (
    <div id="page" data-page={page}>
      Page: {page}
    </div>
  )
}
