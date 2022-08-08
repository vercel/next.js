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

const hasIntersectionObserver = typeof IntersectionObserver === 'function'

export function useIntersection<T extends Element>({
  rootRef,
  rootMargin,
  disabled,
}: UseIntersection): [(element: T | null) => void, boolean, () => void] {
  const isDisabled: boolean = disabled || !hasIntersectionObserver

  const unobserve = useRef<Function>()
  const [visible, setVisible] = useState(false)
  const [element, setElement] = useState<T | null>(null)

  useEffect(() => {
    if (hasIntersectionObserver) {
      if (unobserve.current) {
        unobserve.current()
        unobserve.current = undefined
      }

      if (isDisabled || visible) return

      if (element && element.tagName) {
        unobserve.current = observe(
          element,
          (isVisible) => isVisible && setVisible(isVisible),
          { root: rootRef?.current, rootMargin }
        )
      }

      return () => {
        unobserve.current?.()
        unobserve.current = undefined
      }
    } else {
      if (!visible) {
        const idleCallback = requestIdleCallback(() => setVisible(true))
        return () => cancelIdleCallback(idleCallback)
      }
    }
  }, [element, isDisabled, rootMargin, rootRef, visible])

  const resetVisible = useCallback(() => {
    setVisible(false)
  }, [])

  return [setElement, visible, resetVisible]
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
      const index = idList.findIndex(
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
  const existing = idList.find(
    (obj) => obj.root === id.root && obj.margin === id.margin
  )
  let instance: Observer | undefined

  if (existing) {
    instance = observers.get(existing)
    if (instance) {
      return instance
    }
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
  instance = {
    id,
    observer,
    elements,
  }

  idList.push(id)
  observers.set(id, instance)
  return instance
}
