import { useCallback, useEffect, useRef, useState } from 'react'

type UseIntersectionObserverInit = Pick<IntersectionObserverInit, 'rootMargin'>
type UseIntersection = { disabled?: boolean } & UseIntersectionObserverInit
type ObserveCallback = (isVisible: boolean) => void

const hasIntersectionObserver = typeof IntersectionObserver !== 'undefined'

export function useIntersection<T extends Element>({
  rootMargin,
  disabled,
}: UseIntersection): [(element: T | null) => void, boolean] {
  const isDisabled = disabled || hasIntersectionObserver

  const unobserve = useRef<Function>()
  const [visible, setVisible] = useState(false)

  const setRef = useCallback(
    (el: T | null) => {
      if (unobserve.current) {
        unobserve.current()
        unobserve.current = undefined
      }

      if (isDisabled || visible) return

      if (el) {
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
      setVisible(true)
    }
  }, [])

  return [setRef, visible]
}

function observe(
  element: Element,
  callback: ObserveCallback,
  options: UseIntersectionObserverInit
) {
  const { id, observer, elements } = createObserver(options)
  if (!elements.has(element)) {
    elements.set(element, [])
  }

  const callbacks = elements.get(element)!
  callbacks.push(callback)
  observer.observe(element)

  return function unobserve() {
    callbacks.splice(callbacks.indexOf(callback), 1)

    // Unobserve element when there are no remaining listeners:
    if (callbacks.length === 0) {
      elements.delete(element)
      observer.unobserve(element)
    }

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
    elements: Map<Element, Array<ObserveCallback>>
  }
>()
function createObserver(options: UseIntersectionObserverInit) {
  const id = options.rootMargin || ''
  let instance = observers.get(id)
  if (instance) {
    return instance
  }

  const elements = new Map<Element, Array<ObserveCallback>>()
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const el = elements.get(entry.target)
      if (el) {
        el.forEach((callback) => {
          callback(entry.isIntersecting || entry.intersectionRatio > 0)
        })
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
