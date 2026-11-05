import 'react-dom/unstable_server-external-runtime'
import { getClientResumeMetadata, getClientResumeState } from './client-resume'
import {
  NEXT_ROUTER_PREFETCH_HEADER,
  NEXT_ROUTER_PREFETCH_STATIC,
  NEXT_ROUTER_SEGMENT_PREFETCH_HEADER,
  RSC_HEADER,
} from './components/app-router-headers'

const resumeMetadata = getClientResumeMetadata()
if (resumeMetadata) {
  const state = getClientResumeState()
  if (!state.started) {
    state.started = true
    const response = fetch(location.pathname + '?' + resumeMetadata.content, {
      credentials: 'same-origin',
      headers: {
        [RSC_HEADER]: '1',
        [NEXT_ROUTER_PREFETCH_HEADER]: NEXT_ROUTER_PREFETCH_STATIC,
        [NEXT_ROUTER_SEGMENT_PREFETCH_HEADER]: '/_full',
      },
    })
    window.__NEXT_CLIENT_RESUME = response
    state.resolve(response)
  }
}

const iconInstructionSelector = 'template[data-next-icon]'

function relocateIcons(root: ParentNode): boolean {
  const instruction =
    root instanceof Element && root.matches(iconInstructionSelector)
      ? root
      : root.querySelector(iconInstructionSelector)

  if (!instruction) {
    return false
  }

  document
    .querySelectorAll(
      'body link[rel="icon"], body link[rel="apple-touch-icon"]'
    )
    .forEach((icon) => document.head.appendChild(icon))
  instruction.remove()
  return true
}

if (!relocateIcons(document) && document.readyState === 'loading') {
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof Element && relocateIcons(node)) {
          observer.disconnect()
          return
        }
      }
    }
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })
  document.addEventListener(
    'DOMContentLoaded',
    () => {
      relocateIcons(document)
      observer.disconnect()
    },
    { once: true }
  )
}
