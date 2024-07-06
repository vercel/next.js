type RequestErrorContext = {
  routerKind: 'Pages Router' | 'App Router'
  routePath: string // the route file path, e.g. /app/blog/[dynamic]
  routeType: 'render' | 'route' | 'action' | 'middleware'
  // TODO: other future instrumentation context
}

export type InstrumentationModule = {
  register?(): void
  onRequestError?(
    error: unknown,
    errorRequest: Readonly<{
      method: string
      url: string
      headers: NodeJS.Dict<string | string[]>
    }>,
    errorContext: Readonly<RequestErrorContext>
  ): void | Promise<void>
}

export type InstrumentationOnRequestError =
  InstrumentationModule['onRequestError']
