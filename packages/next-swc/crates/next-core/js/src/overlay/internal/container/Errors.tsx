import * as React from 'react'

import { Issue } from '@vercel/turbopack-dev/types/protocol'

import {
  TYPE_UNHANDLED_ERROR,
  TYPE_UNHANDLED_REJECTION,
  UnhandledError,
  UnhandledRejection,
} from '../bus'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogHeaderTabList,
  DialogProps,
} from '../components/Dialog'
import { Overlay } from '../components/Overlay'
import { Tab, TabPanel, Tabs } from '../components/Tabs'
import {
  getErrorByType,
  getUnresolvedErrorByType,
  ReadyRuntimeError,
} from '../helpers/getErrorByType'
import { noop as css } from '../helpers/noop-template'
import { AlertOctagon, PackageX } from '../icons'
import { RuntimeErrorsDialogBody } from './RuntimeError'
import { TurbopackIssuesDialogBody } from '../container/TurbopackIssue'
import { ErrorsToast } from '../container/ErrorsToast'

export type SupportedErrorEvent = {
  id: number
  event: UnhandledError | UnhandledRejection
}
export type ErrorsProps = {
  issues: Issue[]
  errors: SupportedErrorEvent[]
}

type ReadyErrorEvent = ReadyRuntimeError

function getErrorSignature(ev: SupportedErrorEvent): string {
  const { event } = ev
  switch (event.type) {
    case TYPE_UNHANDLED_ERROR:
    case TYPE_UNHANDLED_REJECTION: {
      return `${event.reason.name}::${event.reason.message}::${event.reason.stack}`
    }
    default: {
      return ''
    }
  }
}

function useResolvedErrors(
  errors: SupportedErrorEvent[]
): [ReadyRuntimeError[], boolean] {
  const [lookups, setLookups] = React.useState(
    {} as { [eventId: string]: ReadyErrorEvent }
  )

  const [readyErrors, nextError] = React.useMemo<
    [ReadyErrorEvent[], SupportedErrorEvent | null]
  >(() => {
    const ready: ReadyErrorEvent[] = []
    let next: SupportedErrorEvent | null = null

    // Ensure errors are displayed in the order they occurred in:
    for (let idx = 0; idx < errors.length; ++idx) {
      const e = errors[idx]
      const { id } = e
      if (id in lookups) {
        ready.push(lookups[id])
        continue
      }

      // Check for duplicate errors
      if (idx > 0) {
        const prev = errors[idx - 1]
        if (getErrorSignature(prev) === getErrorSignature(e)) {
          continue
        }
      }

      // Show unresolved errors as fallback
      ready.push(getUnresolvedErrorByType(e))

      next = e
      break
    }

    return [ready, next]
  }, [errors, lookups])

  const isLoading = readyErrors.length === 0 && errors.length > 1

  React.useEffect(() => {
    if (nextError == null) {
      return
    }
    let mounted = true

    getErrorByType(nextError).then(
      (resolved) => {
        // We don't care if the desired error changed while we were resolving,
        // thus we're not tracking it using a ref. Once the work has been done,
        // we'll store it.
        if (mounted) {
          setLookups((m) => ({ ...m, [resolved.id]: resolved }))
        }
      },
      () => {
        // TODO: handle this, though an edge case
      }
    )

    return () => {
      mounted = false
    }
  }, [nextError])

  // Reset component state when there are no errors to be displayed.
  // This should never happen, but let's handle it.
  React.useEffect(() => {
    if (errors.length === 0) {
      setLookups({})
    }
  }, [errors.length])

  return [readyErrors, isLoading]
}

const enum TabId {
  TurbopackErrors = 'turbopack-issues',
  TurbopackWarnings = 'turbopack-warnings',
  TurbopackExternal = 'turbopack-external',
  RuntimeErrors = 'runtime-errors',
  RuntimeWarnings = 'runtime-warnings',
}

const TAB_PRIORITY = [
  TabId.TurbopackErrors,
  TabId.RuntimeErrors,
  TabId.TurbopackWarnings,
]

function isWarning(issue: Issue) {
  return !['bug', 'fatal', 'error'].includes(issue.severity)
}

function isUserCode(issue: Issue) {
  return !issue.context || !issue.context.includes('node_modules')
}

function isRuntimeWarning(error: ReadyRuntimeError) {
  return [
    'This Suspense boundary received an update before it finished hydrating.',
    'Hydration failed because the initial UI does not match what was rendered on the server.',
    'There was an error while hydrating. Because the error happened outside of a Suspense boundary, the entire root will switch to client rendering.',
  ].some((message) => error.error.message.includes(message))
}

interface TabBase {
  id: TabId
  icon: any
  title: {
    one: string
    many: string
    short: string
  }
  message: any
  autoOpen: boolean
  severity: 'error' | 'warning' | 'none'
  as: any
}

interface TabConfig extends TabBase {
  items: (input: {
    readyErrors: ReadyRuntimeError[]
    issues: Issue[]
  }) => ReadyRuntimeError[] | Issue[]
}

const TABS: TabConfig[] = [
  {
    id: TabId.RuntimeErrors,
    icon: <AlertOctagon />,
    title: {
      one: 'Runtime Error',
      many: 'Runtime Errors',
      short: 'Err',
    },
    message: <>Unhandled errors reported when running the application.</>,
    items: ({ readyErrors }) => {
      return readyErrors.filter((e) => !isRuntimeWarning(e))
    },
    severity: 'error',
    autoOpen: true,
    as: RuntimeErrorsDialogBody,
  },
  {
    id: TabId.TurbopackErrors,
    icon: <PackageX />,
    title: {
      one: 'Turbopack Error',
      many: 'Turbopack Errors',
      short: 'Err',
    },
    message: (
      <>
        Errors reported when compiling the application.
        <br />
        The application might work partially, but that's unlikely.
      </>
    ),
    items: ({ issues }) => {
      return issues.filter((i) => isUserCode(i) && !isWarning(i))
    },
    severity: 'error',
    autoOpen: true,
    as: TurbopackIssuesDialogBody,
  },
  {
    id: TabId.RuntimeWarnings,
    icon: <AlertOctagon />,
    title: {
      one: 'Runtime Warnings',
      many: 'Runtime Warnings',
      short: 'Warn',
    },
    message: (
      <>
        Unhandled errors reported when running the application.
        <br />
        The application might work partially, but that's unlikely.
      </>
    ),
    items: ({ readyErrors }) => {
      return readyErrors.filter((e) => isRuntimeWarning(e))
    },
    severity: 'warning',
    autoOpen: false,
    as: RuntimeErrorsDialogBody,
  },
  {
    id: TabId.TurbopackWarnings,
    icon: <PackageX />,
    title: {
      one: 'Turbopack Warning',
      many: 'Turbopack Warnings',
      short: 'Warn',
    },
    message: (
      <>
        Warnings reported when compiling the application.
        <br />
        The application will probably work regardless, but these issues should
        be addressed eventually.
      </>
    ),
    items: ({ issues }) => {
      return issues.filter((i) => isUserCode(i) && isWarning(i))
    },
    severity: 'warning',
    autoOpen: false,
    as: TurbopackIssuesDialogBody,
  },
  {
    id: TabId.TurbopackExternal,
    icon: <PackageX />,
    title: {
      one: 'Turbopack External Problem',
      many: 'Turbopack External Problems',
      short: 'Ext',
    },
    message: (
      <>
        Errors or warnings reported while compiling external code.
        <br />
        The application might be affected by them.
      </>
    ),
    items: ({ issues }) => {
      return issues.filter((i) => !isUserCode(i) && !isWarning(i))
    },
    severity: 'none',
    autoOpen: false,
    as: TurbopackIssuesDialogBody,
  },
]

interface Tab extends TabBase {
  items: ReadyRuntimeError[] | Issue[]
}

// "instantiates" all tabs, filters out the ones that don't have any items
function createTabs({
  issues,
  readyErrors,
}: {
  issues: Issue[]
  readyErrors: ReadyRuntimeError[]
}): Tab[] {
  const tabs = TABS.map((tab) => ({
    ...tab,
    items: tab.items({ issues, readyErrors }),
  }))

  return tabs.filter((tab) => tab.items.length > 0)
}

function itemHash(item: object) {
  return JSON.stringify(item)
}

type DisplayState =
  | {
      type: 'fullscreen'
      tab: TabId
    }
  | {
      type: 'minimized'
    }
  | {
      type: 'hidden'
    }

type ErrorsState = {
  tabs: Tab[]
  display: DisplayState
  errorCount: number
  warningCount: number

  seenIds: Set<string>
  issues: Issue[]
  readyErrors: ReadyRuntimeError[]
  lastSelectedTab: TabId | null
}

enum ErrorsActionType {
  UpdateIssues = 'update-issues',
  UpdateErrors = 'update-errors',
  SelectTab = 'select-tab',
  Fullscreen = 'fullscreen',
  Minimize = 'minimize',
  Hide = 'hide',
}

type UpdateIssuesAction = {
  type: typeof ErrorsActionType.UpdateIssues
  issues: Issue[]
}

type UpdateErrorsAction = {
  type: typeof ErrorsActionType.UpdateErrors
  readyErrors: ReadyRuntimeError[]
}

type SelectTabAction = {
  type: typeof ErrorsActionType.SelectTab
  tabId: TabId
}

type FullscreenAction = {
  type: typeof ErrorsActionType.Fullscreen
}

type MinimizeAction = {
  type: typeof ErrorsActionType.Minimize
}

type HideAction = {
  type: typeof ErrorsActionType.Hide
}

type ErrorsAction =
  | UpdateIssuesAction
  | UpdateErrorsAction
  | SelectTabAction
  | FullscreenAction
  | MinimizeAction
  | HideAction

// puts item
function prependNewItems<T extends object>(
  items: T[],
  seenIds: Set<string>
): T[] {
  const newItems = []
  let newIdx = 0

  for (const item of items) {
    if (seenIds.has(itemHash(item))) {
      newItems.push(item)
    } else {
      newItems.splice(newIdx, 0, item)
    }
  }

  return newItems
}

function reducer(oldState: ErrorsState, action: ErrorsAction): ErrorsState {
  let state = oldState
  switch (action.type) {
    case ErrorsActionType.UpdateIssues: {
      if (action.issues == oldState.issues) {
        return oldState
      }

      const issues = prependNewItems(action.issues, oldState.seenIds)

      state = {
        ...oldState,
        issues,
        tabs: createTabs({
          issues,
          readyErrors: oldState.readyErrors,
        }),
      }
      break
    }
    case ErrorsActionType.UpdateErrors: {
      if (action.readyErrors == oldState.readyErrors) {
        return oldState
      }

      const readyErrors = prependNewItems(action.readyErrors, oldState.seenIds)

      state = {
        ...oldState,
        readyErrors,
        tabs: createTabs({
          issues: oldState.issues,
          readyErrors,
        }),
      }
      break
    }
    case ErrorsActionType.SelectTab: {
      state = {
        ...oldState,
        display: {
          type: 'fullscreen',
          tab: action.tabId,
        },
      }
      break
    }
    case ErrorsActionType.Fullscreen: {
      state = {
        ...oldState,
        display: {
          type: 'fullscreen',
          tab: oldState.lastSelectedTab || TabId.TurbopackErrors,
        },
      }
      break
    }
    case ErrorsActionType.Minimize: {
      return {
        ...oldState,
        display: {
          type: 'minimized',
        },
      }
    }
    case ErrorsActionType.Hide: {
      return {
        ...oldState,
        display: {
          type: 'hidden',
        },
      }
    }
  }

  let autoOpen = false

  // When the selected tab disappears we will go to another important tab or close the overlay
  if (
    state.display.type == 'fullscreen' &&
    !state.tabs.map((tab) => tab.id).includes(state.display.tab)
  ) {
    const otherImportantTab = state.tabs.find((tab) => tab.autoOpen)
    if (otherImportantTab) {
      state.display.tab = otherImportantTab.id
    } else {
      state.display = {
        type: 'hidden',
      }
    }
  } else {
    autoOpen = true
  }

  state.seenIds = new Set()
  // When there is a new item we open the overlay when autoOpen is set
  for (const tab of state.tabs) {
    for (const item of tab.items) {
      state.seenIds.add(itemHash(item))
      if (!oldState.seenIds.has(itemHash(item))) {
        if (state.display.type == 'hidden') {
          state.display = {
            type: 'minimized',
          }
        }

        if (autoOpen && tab.autoOpen) {
          state.display = {
            type: 'fullscreen',
            tab: tab.id,
          }
        }
      }
    }
  }

  if (state.tabs !== oldState.tabs) {
    state.errorCount = state.tabs.reduce(
      (sum, tab) => sum + (tab.severity === 'error' ? tab.items.length : 0),
      0
    )
    state.warningCount = state.tabs.reduce(
      (sum, tab) => sum + (tab.severity === 'warning' ? tab.items.length : 0),
      0
    )
  }

  if (
    state.tabs.length === 0 ||
    (state.errorCount === 0 && state.warningCount === 0)
  ) {
    state.display = {
      type: 'hidden',
    }
  }

  if (state.display.type === 'fullscreen') {
    state.lastSelectedTab = state.display.tab
  }

  return state
}

export function Errors({ issues, errors }: ErrorsProps) {
  const [readyErrors, _isLoading] = useResolvedErrors(errors)

  const [{ tabs, display, errorCount, warningCount }, dispatch] =
    React.useReducer<React.Reducer<ErrorsState, ErrorsAction>, null>(
      reducer,
      null,
      () =>
        reducer(
          {
            seenIds: new Set(),
            tabs: [],
            lastSelectedTab: null,
            display: {
              type: 'hidden',
            },
            issues: [],
            readyErrors,
            errorCount: 0,
            warningCount: 0,
          },
          { type: ErrorsActionType.UpdateIssues, issues }
        )
    )

  React.useEffect(() => {
    dispatch({ type: ErrorsActionType.UpdateIssues, issues })
  }, [issues])
  React.useEffect(() => {
    dispatch({ type: ErrorsActionType.UpdateErrors, readyErrors })
  }, [readyErrors])

  function setSelectedTab(tabId: string) {
    dispatch({
      type: ErrorsActionType.SelectTab,
      tabId: tabId as TabId,
    })
  }

  if (display.type == 'hidden') {
    return null
  }

  if (display.type == 'minimized') {
    return (
      <ErrorsToast
        errorCount={errorCount}
        warningCount={warningCount}
        severity={errorCount > 0 ? 'error' : 'warning'}
        onClick={() => setSelectedTab(tabs[0].id)}
        onClose={() => dispatch({ type: ErrorsActionType.Hide })}
      />
    )
  }

  return (
    <ErrorsDialog
      aria-labelledby="nextjs__container_errors_label"
      aria-describedby="nextjs__container_errors_desc"
      onClose={() => dispatch({ type: ErrorsActionType.Minimize })}
    >
      <Tabs
        defaultId={TabId.RuntimeErrors}
        selectedId={display.tab}
        onChange={setSelectedTab}
      >
        <DialogHeader
          className="errors-header"
          close={() => dispatch({ type: ErrorsActionType.Minimize })}
        >
          <DialogHeaderTabList>
            {tabs.map((tab, i) => (
              <Tab
                key={tab.id}
                id={tab.id}
                next={tabs[(i + 1) % tabs.length].id}
                prev={tabs[(i + tabs.length - 1) % tabs.length].id}
                data-severity={tab.severity}
              >
                {tab.icon} {tab.items.length}{' '}
                {tabs.length > 3
                  ? tab.title.short
                  : tab.items.length > 1
                  ? tab.title.many
                  : tab.title.one}
              </Tab>
            ))}
          </DialogHeaderTabList>
        </DialogHeader>
        {tabs.map((tab) => (
          <TabPanel
            key={tab.id}
            id={tab.id}
            as={tab.as}
            items={tab.items}
            message={tab.message}
            severity={tab.severity}
            className="errors-body"
          />
        ))}
      </Tabs>
    </ErrorsDialog>
  )
}

function ErrorsDialog({ children, ...props }: DialogProps) {
  return (
    <Overlay>
      <Dialog {...props}>
        <DialogContent>{children}</DialogContent>
      </Dialog>
    </Overlay>
  )
}

export const styles = css`
  /** == Header == */

  .errors-header > .tab-list > .tab > svg {
    margin-right: var(--size-gap);
  }

  .errors-header > .tab-list > .tab[data-severity='error'] > svg {
    color: var(--color-error);
  }

  .errors-header > .tab-list > .tab[data-severity='warning'] > svg {
    color: var(--color-warning);
  }

  .errors-header > .tab-list > .tab {
    position: relative;
  }

  .errors-header > .tab-list > .tab[data-severity='error']::after {
    border-top-color: var(--color-error);
  }

  .errors-header > .tab-list > .tab[data-severity='warning']::after {
    border-top-color: var(--color-warning);
  }

  /** == Body == */

  .errors-body {
    display: flex;
    flex-direction: column;
    overflow-y: hidden;
  }

  .errors-body > .title-pagination {
    display: flex;
    justify-content: space-between;
    align-items: center;

    margin-bottom: var(--size-gap);
  }

  .errors-body > .title-pagination > nav > small {
    font-size: var(--size-font-small);
    color: var(--color-text-dim);
    margin-right: var(--size-gap);
    opacity: 0.7;
  }

  .errors-body > .title-pagination > nav > small > span {
    font-family: var(--font-mono);
  }

  .errors-body > .title-pagination > h1 {
    font-size: var(--size-font-big);
    color: var(--color-text-dim);
    margin: 0;
    opacity: 0.9;
  }

  .errors-body > h2 {
    font-family: var(--font-mono);
    font-size: var(--size-font-big);
    line-height: var(--size-font-bigger);
    font-weight: bold;
    margin: 0;
    margin-bottom: var(--size-gap);
    color: var(--color-error);
    white-space: pre-wrap;
    overflow-wrap: break-word;
  }

  .errors-body > h2[data-severity='error'] {
    color: var(--color-error);
  }

  .errors-body > h2[data-severity='warning'] {
    color: var(--color-warning);
  }

  .errors-body > div > small {
    margin: 0;
    margin-top: var(--size-gap-half);
  }

  .errors-body > h2 > a {
    color: var(--color-error);
  }

  .errors-body > h5:not(:first-child) {
    margin-top: var(--size-gap-double);
  }

  .errors-body > h5 {
    margin-bottom: var(--size-gap);
  }
`
