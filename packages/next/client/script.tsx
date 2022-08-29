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
  onReady?: () => void | null
  onError?: (e: any) => void
  children?: React.ReactNode
}

/**
 * @deprecated Use `ScriptProps` instead.
 */
export type Props = ScriptProps

const ignoreProps = [
  'onLoad',
  'onReady',
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
    onReady = null,
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
      // add cacheKey to LoadCache when load successfully
      LoadCache.add(cacheKey)

      resolve()
      if (onLoad) {
        onLoad.call(this, e)
      }
      // Run onReady for the first time after load event
      if (onReady) {
        onReady()
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

  if (dangerouslySetInnerHTML) {
    el.innerHTML = dangerouslySetInnerHTML.__html || ''

    // add cacheKey to LoadCache for inline script
    LoadCache.add(cacheKey)
  } else if (children) {
    el.textContent =
      typeof children === 'string'
        ? children
        : Array.isArray(children)
        ? children.join('')
        : ''

    // add cacheKey to LoadCache for inline script
    LoadCache.add(cacheKey)
  } else if (src) {
    el.src = src
    // do not add cacheKey into LoadCache for remote script here
    // cacheKey will be added to LoadCache when it is actually loaded (see loadPromise above)

    ScriptCache.set(src, loadPromise)
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
    id,
    src = '',
    onLoad = () => {},
    onReady = null,
    strategy = 'afterInteractive',
    onError,
    ...restProps
  } = props

  // Context is available only during SSR
  const { updateScripts, scripts, getIsSsr } = useContext(HeadManagerContext)

  useEffect(() => {
    const cacheKey = id || src

    // Run onReady if script has loaded before but component is re-mounted
    if (onReady && cacheKey && LoadCache.has(cacheKey)) {
      onReady()
    }
  }, [onReady, id, src])

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
          id,
          src,
          onLoad,
          onReady,
          onError,
          ...restProps,
        },
      ])
      updateScripts(scripts)
    } else if (getIsSsr && getIsSsr()) {
      // Script has already loaded during SSR
      LoadCache.add(id || src)
    } else if (getIsSsr && !getIsSsr()) {
      loadScript(props)
    }
  }

  return null
}

Object.defineProperty(Script, '__nextScript', { value: true })

export default Script
