let ClientReact: typeof import('react') | null = null
export function registerClientReact(react: typeof import('react')) {
  ClientReact = react
}
export function getClientReact() {
  return ClientReact
}

let ServerReact: typeof import('react') | null = null
export function registerServerReact(react: typeof import('react')) {
  ServerReact = react
}
export function getServerReact() {
  return ServerReact
}
