import { useCallback, useEffect, useRef, useState } from 'react'
import requestIdleCallback from './request-idle-callback'

type UseIntersectionObserverInit = Pick<IntersectionObserverInit, 'rootMargin'>
type UseIntersection = { disabled?: boolean } & UseIntersectionObserverInit
type ObserveCallback = (isVisible: boolean) => void

const hasIntersectionObserver = typeof IntersectionObserver !== 'undefined'

export function useIntersection<T extends Element>({
  rootMargin,
  disabled,
}: UseIntersection): [(element: T | null) => void, boolean] {
  const isDisabled = disabled || !hasIntersectionObserver

  const unobserve = useRef<Function>()
  const [visible, setVisible] = useState(false)

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
          { rootMargin }
        )
      }
    },
    [isDisabled, rootMargin, visible]
  )

  useEffect(() => {
    if (!hasIntersectionObserver) {
      if (!visible) requestIdleCallback(() => setVisible(true))
    }
  }, [visible])

  return [setRef, visible]
}

function observe(
  element: Element,
  callback: ObserveCallback,
  options: UseIntersectionObserverInit
) {
  const { id, observer, elements } = createObserver(options)
  elements.set(element, callback)

  observer.observe(element)
  return function unobserve() {
    observer.unobserve(element)

    // Destroy observer when there's nothing left to watch:
    if (elements.size === 0) {
      observer.disconnect()
      observers.delete(id)
    }
  }
}

const observers = new Map<
  string,
  {
    id: string
    observer: IntersectionObserver
    elements: Map<Element, ObserveCallback>
  }
>()
function createObserver(options: UseIntersectionObserverInit) {
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
