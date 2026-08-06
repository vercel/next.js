import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type Ref,
  type RefObject,
} from 'react'

interface DragContextValue {
  register: (el: HTMLElement) => void
  unregister: (el: HTMLElement) => void
  handles: Set<HTMLElement>
  disabled: boolean
}

const DragContext = createContext<DragContextValue | null>(null)

export function DragProvider({
  children,
  disabled = false,
}: {
  children: React.ReactNode
  disabled?: boolean
}) {
  const handlesRef = useRef<Set<HTMLElement>>(new Set())

  const register = useCallback((el: HTMLElement) => {
    handlesRef.current.add(el)
  }, [])

  const unregister = useCallback((el: HTMLElement) => {
    handlesRef.current.delete(el)
  }, [])

  const value = useMemo<DragContextValue>(
    () => ({
      register,
      unregister,
      handles:
        // eslint-disable-next-line react-hooks/refs -- TODO
        handlesRef.current,
      disabled,
    }),
    [register, unregister, disabled]
  )

  return <DragContext.Provider value={value}>{children}</DragContext.Provider>
}

export function useDragContext() {
  return useContext(DragContext)
}

export function DragHandle({
  children,
  ref,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { ref?: Ref<HTMLDivElement> }) {
  const internalRef = useRef<HTMLDivElement>(null)
  const ctx = useDragContext()

  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      internalRef.current = node ?? null
      if (typeof ref === 'function') {
        ref(node)
      } else if (ref && typeof ref === 'object') {
        ;(ref as RefObject<HTMLDivElement | null>).current = node
      }
    },
    [ref]
  )

  useEffect(() => {
    if (!ctx || !internalRef.current || ctx.disabled) return
    const el = internalRef.current
    ctx.register(el)
    return () => ctx.unregister(el)
  }, [ctx])

  return (
    <div
      ref={setRef}
      {...props}
      style={{
        cursor: ctx?.disabled ? 'default' : 'grab',
        ...(props.style || {}),
      }}
    >
      {children}
    </div>
  )
}
