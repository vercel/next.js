import React from 'react'
import { clientRef } from './client-component'

export const contentType = 'image/png'
const cachedNoop = React.cache(() => null)

function noopCall(value) {
  return value
}

export default function sitemap() {
  // keep the variable from being tree-shaken
  noopCall(clientRef)
  cachedNoop()
  return []
}
