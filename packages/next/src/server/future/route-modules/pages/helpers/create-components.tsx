import React from 'react'

const Noop = (): null => null

export function createBody(
  inAmpMode: boolean
): React.FunctionComponent<{ children: JSX.Element }> {
  if (inAmpMode) {
    return ({ children }) => children
  }

  return ({ children }) => <div id="__next">{children}</div>
}

export function createErrorDebug(): React.FunctionComponent<{
  error: Error
}> | null {
  if (process.env.NODE_ENV !== 'development') return null

  return ({ error }: { error: Error }) => {
    // Load the ReactDevOverlay component dynamically to avoid loading it in
    // production.

    // FIXME: (wyattjoh) the types for this are not correct
    const {
      ReactDevOverlay,
    } = require('next/dist/compiled/@next/react-dev-overlay/dist/client')

    return <ReactDevOverlay error={error} />
  }
}

export function createAppContainerWithIsomorphicFiberStructure(
  AppContainer: React.FunctionComponent<{ children: JSX.Element }>
): React.FunctionComponent<{ children: JSX.Element }> {
  return ({ children }): JSX.Element => (
    <>
      {/* <Head/> */}
      <Noop />
      <AppContainer>
        <>
          {/* TODO: (wyattjoh) why are these here? */}
          {/* <ReactDevOverlay/> */}
          {process.env.NODE_ENV === 'development' ? (
            <>
              {children}
              <Noop />
            </>
          ) : (
            children
          )}
          {/* <RouteAnnouncer/> */}
          <Noop />
        </>
      </AppContainer>
    </>
  )
}
