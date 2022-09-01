import React, { useEffect, useContext, useRef } from 'react'
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

  /** Execute after the script first loaded */
  const afterLoad = () => {
    // Run onReady for the first time after load event
    if (onReady) {
      onReady()
    }
    // add cacheKey to LoadCache when load successfully
    LoadCache.add(cacheKey)
  }

  const el = document.createElement('script')

  const loadPromise = new Promise<void>((resolve, reject) => {
    el.addEventListener('load', function (e) {
      resolve()
      if (onLoad) {
        onLoad.call(this, e)
      }
      afterLoad()
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

    afterLoad()
  } else if (children) {
    el.textContent =
      typeof children === 'string'
        ? children
        : Array.isArray(children)
        ? children.join('')
        : ''

    afterLoad()
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

  /**
   * - First mount:
   *   1. The useEffect for onReady executes
   *   2. hasOnReadyEffectCalled.current is false, but the script hasn't loaded yet (not in LoadCache)
   *      onReady is skipped, set hasOnReadyEffectCalled.current to true
   *   3. The useEffect for loadScript executes
   *      Once the script is loaded, the onReady will be called by then
   *   [If strict mode is enabled / is wrapped in <OffScreen /> component]
   *   5. The useEffect for onReady executes again
   *   6. hasOnReadyEffectCalled.current is true, so entire effect is skipped
   *   7. The useEffect for loadScript executes again
   *   8. The script is already loaded/loading, loadScript bails out
   *
   * - Second mount:
   *   1. The useEffect for onReady executes
   *   2. hasOnReadyEffectCalled.current is false, but the script has already loaded (found in LoadCache)
   *      onReady is called, set hasOnReadyEffectCalled.current to true
   *   3. The useEffect for loadScript executes
   *   4. The script is already loaded, loadScript bails out
   *   [If strict mode is enabled / is wrapped in <OffScreen /> component]
   *   5. The useEffect for onReady executes again
   *   6. hasOnReadyEffectCalled.current is true, so entire effect is skipped
   *   7. The useEffect for loadScript executes again
   *   8. The script is already loaded, loadScript will bail out
   */
  const hasOnReadyEffectCalled = useRef(false)

  useEffect(() => {
    const cacheKey = id || src
    if (!hasOnReadyEffectCalled.current) {
      // Run onReady if script has loaded before but component is re-mounted
      if (onReady && cacheKey && LoadCache.has(cacheKey)) {
        onReady()
      }

      hasOnReadyEffectCalled.current = true
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
