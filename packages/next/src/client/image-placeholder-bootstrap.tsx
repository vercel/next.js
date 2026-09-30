'use client'

import { useContext } from 'react'
import { HeadManagerContext } from '../shared/lib/head-manager-context.shared-runtime'
import { ServerInsertedHTMLContext } from '../shared/lib/server-inserted-html.shared-runtime'
import { imageBlurBootstrap } from './image-blur-bootstrap'

// The keys belong to an individual SSR request, not to an Image instance. Weak
// references avoid retaining requests after their HTML has finished rendering.
const registered = new WeakSet<object>()

export function ImagePlaceholderBootstrap() {
  const insertHTML = useContext(ServerInsertedHTMLContext)
  const headManager = useContext(HeadManagerContext)
  if (typeof window !== 'undefined') return null

  const context = insertHTML || headManager
  if (registered.has(context)) return null
  registered.add(context)

  const props = {
    id: '__next-image-blur',
    nonce: headManager.nonce,
    dangerouslySetInnerHTML: {
      __html: `(${imageBlurBootstrap.toString()})()`,
    },
  }
  if (insertHTML) {
    let inserted = false
    insertHTML(() => {
      if (inserted) return null
      inserted = true
      // App Router's beforeInteractive scripts are queued for app-bootstrap.
      // This script must execute even when that bundle has not arrived yet.
      return <script {...props} />
    })
    return null
  }
  if (headManager.updateScripts) {
    const scripts = headManager.scripts
    scripts.beforeInteractive = (scripts.beforeInteractive || []).concat(props)
    headManager.updateScripts(scripts)
  }
  return null
}
