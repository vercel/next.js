export type NextComponentModule =
  | typeof import('./app-page')
  | typeof import('./app-route')
  | typeof import('./pages-api')
  | typeof import('./pages')
