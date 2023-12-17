export const NEXT_TS_ERRORS = {
  INVALID_SERVER_API: 71001,
  INVALID_ENTRY_EXPORT: 71002,
  INVALID_OPTION_VALUE: 71003,
  MISPLACED_CLIENT_ENTRY: 71004,
  INVALID_PAGE_PROP: 71005,
  INVALID_CONFIG_OPTION: 71006,
  INVALID_CLIENT_ENTRY_PROP: 71007,
  INVALID_METADATA_EXPORT: 71008,
  INVALID_ERROR_COMPONENT: 71009,
}

export const ALLOWED_EXPORTS = [
  'config',
  'generateStaticParams',
  'metadata',
  'generateMetadata',
  'viewport',
  'generateViewport',
]

export const LEGACY_CONFIG_EXPORT = 'config'

export const DISALLOWED_SERVER_REACT_APIS: string[] = [
  'useState',
  'useEffect',
  'useLayoutEffect',
  'useDeferredValue',
  'useImperativeHandle',
  'useInsertionEffect',
  'useReducer',
  'useRef',
  'useSyncExternalStore',
  'useTransition',
  'Component',
  'PureComponent',
  'createContext',
  'createFactory',
  'experimental_useOptimistic',
  'useOptimistic',
]

export const ALLOWED_PAGE_PROPS = ['params', 'searchParams']
export const ALLOWED_LAYOUT_PROPS = ['params', 'children']
