import { useCallback, useEffect, useRef, useState } from 'react'
import {
  requestIdleCallback,
  cancelIdleCallback,
} from './request-idle-callback'

type UseIntersectionObserverInit = Pick<
  IntersectionObserverInit,
  'rootMargin' | 'root'
>

type UseIntersection = { disabled?: boolean } & UseIntersectionObserverInit & {
    rootRef?: React.RefObject<HTMLElement> | null
  }
type ObserveCallback = (isVisible: boolean) => void
type Identifier = {
  root: Element | Document | null
  margin: string
}
type Observer = {
  id: Identifier
  observer: IntersectionObserver
  elements: Map<Element, ObserveCallback>
}

const hasIntersectionObserver = typeof IntersectionObserver !== 'undefined'

export function useIntersection<T extends Element>({
  rootRef,
  rootMargin,
  disabled,
}: UseIntersection): [(element: T | null) => void, boolean, () => void] {
  const isDisabled: boolean = disabled || !hasIntersectionObserver

  const unobserve = useRef<Function>()
  const [visible, setVisible] = useState(false)
  const [root, setRoot] = useState(rootRef ? rootRef.current : null)
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
          { root, rootMargin }
        )
      }
    },
    [isDisabled, root, rootMargin, visible]
  )

  const resetVisible = useCallback(() => {
    setVisible(false)
  }, [])

  useEffect(() => {
    if (!hasIntersectionObserver) {
      if (!visible) {
        const idleCallback = requestIdleCallback(() => setVisible(true))
        return () => cancelIdleCallback(idleCallback)
      }
    }
  }, [visible])

  useEffect(() => {
    if (rootRef) setRoot(rootRef.current)
  }, [rootRef])
  return [setRef, visible, resetVisible]
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
      let index = idList.findIndex(
        (obj) => obj.root === id.root && obj.margin === id.margin
      )
      if (index > -1) {
        idList.splice(index, 1)
      }
    }
  }
}

const observers = new Map<Identifier, Observer>()

const idList: Identifier[] = []

function createObserver(options: UseIntersectionObserverInit): Observer {
  const id = {
    root: options.root || null,
    margin: options.rootMargin || '',
  }
  let existing = idList.find(
    (obj) => obj.root === id.root && obj.margin === id.margin
  )
  let instance
  if (existing) {
    instance = observers.get(existing)
  } else {
    instance = observers.get(id)
    idList.push(id)
  }
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
