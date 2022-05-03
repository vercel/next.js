import React, { useEffect, useContext } from 'react'
import { ScriptHTMLAttributes } from 'react'
import { HeadManagerContext } from '../shared/lib/head-manager-context'
import { DOMAttributeNames } from './head-manager'
import { requestIdleCallback } from './request-idle-callback'

const ScriptCache = new Map()
const LoadCache = new Set()

export interface ScriptProps extends ScriptHTMLAttributes<HTMLScriptElement> {
  strategy?: 'afterInteractive' | 'lazyOnload' | 'beforeInteractive' | 'worker'
  id?: string
  onLoad?: (e: any) => void
  onError?: (e: any) => void
  children?: React.ReactNode
}

/**
 * @deprecated Use `ScriptProps` instead.
 */
export type Props = ScriptProps

const ignoreProps = [
  'onLoad',
  'dangerouslySetInnerHTML',
  'children',
  'onError',
  'strategy',
]

const loadScript = (props: ScriptProps): void => {
  const {
    src,
    id,
    onLoad = () => {},
    dangerouslySetInnerHTML,
    children = '',
    strategy = 'afterInteractive',
    onError,
  } = props

  const cacheKey = id || src

  // Script has already loaded
  if (cacheKey && LoadCache.has(cacheKey)) {
    return
  }

  // Contents of this script are already loading/loaded
  if (ScriptCache.has(src)) {
    LoadCache.add(cacheKey)
    // Execute onLoad since the script loading has begun
    ScriptCache.get(src).then(onLoad, onError)
    return
  }

  const el = document.createElement('script')

  const loadPromise = new Promise<void>((resolve, reject) => {
    el.addEventListener('load', function (e) {
      resolve()
      if (onLoad) {
        onLoad.call(this, e)
      }
    })
    el.addEventListener('error', function (e) {
      reject(e)
    })
  }).catch(function (e) {
    if (onError) {
      onError(e)
    }
  })

  if (src) {
    ScriptCache.set(src, loadPromise)
  }
  LoadCache.add(cacheKey)

  if (dangerouslySetInnerHTML) {
    el.innerHTML = dangerouslySetInnerHTML.__html || ''
  } else if (children) {
    el.textContent =
      typeof children === 'string'
        ? children
        : Array.isArray(children)
        ? children.join('')
        : ''
  } else if (src) {
    el.src = src
  }

  for (const [k, value] of Object.entries(props)) {
    if (value === undefined || ignoreProps.includes(k)) {
      continue
    }

    const attr = DOMAttributeNames[k] || k.toLowerCase()
    el.setAttribute(attr, value)
  }

  if (strategy === 'worker') {
    el.setAttribute('type', 'text/partytown')
  }

  el.setAttribute('data-nscript', strategy)

  document.body.appendChild(el)
}

export function handleClientScriptLoad(props: ScriptProps) {
  const { strategy = 'afterInteractive' } = props
  if (strategy === 'lazyOnload') {
    window.addEventListener('load', () => {
      requestIdleCallback(() => loadScript(props))
    })
  } else {
    loadScript(props)
  }
}

function loadLazyScript(props: ScriptProps) {
  if (document.readyState === 'complete') {
    requestIdleCallback(() => loadScript(props))
  } else {
    window.addEventListener('load', () => {
      requestIdleCallback(() => loadScript(props))
    })
  }
}

function addBeforeInteractiveToCache() {
  const scripts = [
    ...document.querySelectorAll('[data-nscript="beforeInteractive"]'),
    ...document.querySelectorAll('[data-nscript="beforePageRender"]'),
  ]
  scripts.forEach((script) => {
    const cacheKey = script.id || script.getAttribute('src')
    LoadCache.add(cacheKey)
  })
}

export function initScriptLoader(scriptLoaderItems: ScriptProps[]) {
  scriptLoaderItems.forEach(handleClientScriptLoad)
  addBeforeInteractiveToCache()
}

function Script(props: ScriptProps): JSX.Element | null {
  const {
    src = '',
    onLoad = () => {},
    strategy = 'afterInteractive',
    onError,
    ...restProps
  } = props

  // Context is available only during SSR
  const { updateScripts, scripts, getIsSsr } = useContext(HeadManagerContext)

  useEffect(() => {
    if (strategy === 'afterInteractive') {
      loadScript(props)
    } else if (strategy === 'lazyOnload') {
      loadLazyScript(props)
    }
  }, [props, strategy])

  if (strategy === 'beforeInteractive' || strategy === 'worker') {
    if (updateScripts) {
      scripts[strategy] = (scripts[strategy] || []).concat([
        {
          src,
          onLoad,
          onError,
          ...restProps,
        },
      ])
      updateScripts(scripts)
    } else if (getIsSsr && getIsSsr()) {
      // Script has already loaded during SSR
      LoadCache.add(restProps.id || src)
    } else if (getIsSsr && !getIsSsr()) {
      loadScript(props)
    }
  }

  return null
}

export default Script
