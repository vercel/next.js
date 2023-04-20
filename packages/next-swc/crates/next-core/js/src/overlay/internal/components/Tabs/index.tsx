// TODO: replace with `@react/tabs`

import * as React from 'react'
import { noop as css } from '../../helpers/noop-template'
import { createContext } from '../../hooks/context'
import { clsx } from '../../helpers/clsx'

type Merge<P1 = {}, P2 = {}> = Omit<P1, keyof P2> & P2

type PropsWithAs<As, OwnProps = {}> = As extends ''
  ? { as: keyof JSX.IntrinsicElements }
  : As extends React.JSXElementConstructor<infer P>
  ? Merge<P, OwnProps & { as: As }>
  : As extends keyof JSX.IntrinsicElements
  ? Merge<JSX.IntrinsicElements[As], OwnProps & { as: As }>
  : never

type TabRefs = Record<string, HTMLElement | undefined>

type TabsContextType = {
  selectedId: string
  registerTabRef: (id: string, el: HTMLElement | null) => void
  onSelectTab: (id: string) => void
}

const [TabsProvider, useTabsContext] = createContext<TabsContextType>('Tabs')

export type TabsProps = {
  defaultId: string
  selectedId?: string
  onChange?: (id: string) => void
  children: React.ReactNode
}

export function Tabs({
  defaultId,
  selectedId: controlledId,
  onChange,
  children,
}: TabsProps) {
  const [selectedId, setSelectedId] = React.useState(controlledId ?? defaultId)
  const [shouldCheckId, setShouldShouldCheckId] = React.useState(false)

  const tabRefs = React.useRef<TabRefs>({})

  const onSelectTabUnchecked = React.useCallback(
    (id: string) => {
      onChange && onChange(id)
      setSelectedId(id)
    },
    [onChange]
  )

  const onSelectTab = React.useCallback(
    (id: string) => {
      if (id == selectedId) return

      const tab = tabRefs.current[id]
      if (!tab) {
        console.error(
          `Tried selecting invalid tab id "${id}", only ${JSON.stringify(
            Object.keys(tabRefs.current)
          )} are available.`
        )
        return
      }

      setTimeout(() => {
        tab.focus()
      }, 0)

      onSelectTabUnchecked(id)
    },
    [selectedId, onSelectTabUnchecked]
  )

  const registerTabRef = React.useCallback(
    (id: string, el: HTMLElement | null) => {
      if (el == null) {
        delete tabRefs.current[id]
        setShouldShouldCheckId(true)
      } else {
        tabRefs.current[id] = el
      }
    },
    []
  )

  React.useEffect(() => {
    if (!shouldCheckId) return

    const currentTabRef = tabRefs.current[selectedId]
    if (currentTabRef == null) {
      const availableIds = Object.keys(tabRefs.current)
      if (availableIds.length > 0) {
        onSelectTabUnchecked(availableIds[0])
      }
    }

    setShouldShouldCheckId(false)
  }, [shouldCheckId, selectedId, onSelectTabUnchecked])

  React.useEffect(() => {
    if (controlledId && controlledId != selectedId) {
      onSelectTabUnchecked(controlledId)
    }
  }, [controlledId, selectedId, onSelectTabUnchecked])

  return (
    <TabsProvider
      selectedId={selectedId}
      registerTabRef={registerTabRef}
      onSelectTab={onSelectTab}
    >
      {children}
    </TabsProvider>
  )
}

export type TabListProps = {
  className?: string
  children: React.ReactNode
}

export function TabList({ className, children }: TabListProps) {
  return (
    <div role="tablist" className={clsx('tab-list', className)}>
      {children}
    </div>
  )
}

export type TabProps = {
  id: string
  next?: string
  prev?: string
  className?: string
  children: React.ReactNode
}

export function Tab({
  id,
  next,
  prev,
  className,
  children,
  ...rest
}: TabProps & React.HTMLProps<HTMLButtonElement>) {
  const { selectedId, registerTabRef, onSelectTab } = useTabsContext('Tab')
  const selected = id == selectedId

  const click = React.useCallback(
    (ev: React.MouseEvent<any>) => {
      ev.preventDefault()
      onSelectTab(id)
    },
    [id, onSelectTab]
  )

  const keyDown = React.useCallback(
    (ev: React.KeyboardEvent<any>) => {
      if (prev && ev.key === 'ArrowLeft') {
        ev.stopPropagation()
        onSelectTab(prev)
      } else if (next && ev.key === 'ArrowRight') {
        ev.stopPropagation()
        onSelectTab(next)
      }
    },
    [next, prev, onSelectTab]
  )

  const ref = React.useCallback(
    (el: HTMLElement | null) => registerTabRef(id, el),
    [id, registerTabRef]
  )

  return (
    <button
      {...rest}
      type="button"
      ref={ref}
      aria-controls={id}
      id={`tab-${id}`}
      role="tab"
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      className={clsx('tab', className)}
      onClick={click}
      onKeyDown={keyDown}
    >
      {children}
    </button>
  )
}

export type TabPanelPropsBase = {
  id: string
  className?: string
}

export function TabPanel<
  As extends
    | keyof JSX.IntrinsicElements
    | React.JSXElementConstructor<any> = 'div'
>({
  as: Comp = 'div',
  id,
  className,
  children,
  ...rest
}: PropsWithAs<As, TabPanelPropsBase>) {
  const { selectedId } = useTabsContext('Tab')
  const selected = id == selectedId

  return (
    <Comp
      {...rest}
      id={id}
      aria-labelledby={`tab-${id}`}
      role="tabpanel"
      className={clsx('tab-panel', className)}
      data-hidden={!selected}
    >
      {children}
    </Comp>
  )
}

export const styles = css`
  .tab-panel[data-hidden='true'] {
    display: none;
  }
`
