import { useCallback, useEffect, useRef, useState } from 'react'
import { ReactLoadablePlugin } from '../build/webpack/plugins/react-loadable-plugin'
import {
  requestIdleCallback,
  cancelIdleCallback,
} from './request-idle-callback'

type UseIntersectionObserverInit = Pick<
  IntersectionObserverInit,
  'rootMargin' | 'root'
>

type UseIntersection = { disabled?: boolean } & UseIntersectionObserverInit & {
    rootEl?: React.RefObject<HTMLElement> | null
  }
type ObserveCallback = (isVisible: boolean) => void
type Observer = {
  id: string
  observer: IntersectionObserver
  elements: Map<Element, ObserveCallback>
}

const hasIntersectionObserver = typeof IntersectionObserver !== 'undefined'

export function useIntersection<T extends Element>({
  rootEl,
  rootMargin,
  disabled,
}: UseIntersection): [(element: T | null) => void, boolean] {
  const isDisabled: boolean = disabled || !hasIntersectionObserver

  const unobserve = useRef<Function>()
  const [visible, setVisible] = useState(false)
  const [myRoot, setMyroot] = useState(rootEl ? rootEl.current : null)
  const setRef = useCallback(
    (el: T | null) => {
      if (unobserve.current) {
        unobserve.current()
        unobserve.current = undefined
      }

      if (isDisabled || visible) return

      if (el && el.tagName) {
        unobserve.current = observe(
          el,
          (isVisible) => isVisible && setVisible(isVisible),
          { root: myRoot, rootMargin }
        )
      }
    },
    [isDisabled, myRoot, rootMargin, visible]
  )

  useEffect(() => {
    if (!hasIntersectionObserver) {
      if (!visible) {
        const idleCallback = requestIdleCallback(() => setVisible(true))
        return () => cancelIdleCallback(idleCallback)
      }
    }
  }, [visible])

  useEffect(() => {
    if (rootEl) setMyroot(rootEl.current)
  }, [rootEl])
  return [setRef, visible]
}

function observe(
  element: Element,
  callback: ObserveCallback,
  options: UseIntersectionObserverInit
): () => void {
  const { id, observer, elements } = createObserver(options)
  elements.set(element, callback)

  observer.observe(element)
  return function unobserve(): void {
    elements.delete(element)
    observer.unobserve(element)

    // Destroy observer when there's nothing left to watch:
    if (elements.size === 0) {
      observer.disconnect()
      observers.delete(id)
    }
  }
}

const observers = new Map<string, Observer>()
function createObserver(options: UseIntersectionObserverInit): Observer {
  const id = options.rootMargin || ''
  let instance = observers.get(id)
  if (instance) {
    return instance
  }

  const elements = new Map<Element, ObserveCallback>()
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const callback = elements.get(entry.target)
      const isVisible = entry.isIntersecting || entry.intersectionRatio > 0
      if (callback && isVisible) {
        callback(isVisible)
      }
    })
  }, options)

  observers.set(
    id,
    (instance = {
      id,
      observer,
      elements,
    })
  )
  return instance
}
