import { clientRef } from './client-component'

export const contentType = 'image/png'

function noopCall(value) {
  return value
}

export default function sitemap() {
  // keep the variable from being tree-shaken
  noopCall(clientRef)
  return []
}
