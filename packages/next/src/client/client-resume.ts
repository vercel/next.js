type ClientResumeState = {
  response: Promise<Response>
  resolve: (response: Promise<Response>) => void
  started: boolean
}

declare global {
  interface Window {
    __NEXT_CLIENT_RESUME?: Promise<Response>
    __NEXT_CLIENT_RESUME_STATE?: ClientResumeState
  }
}

export function getClientResumeMetadata(): HTMLMetaElement | null {
  return document.querySelector('meta[name="next-client-resume"]')
}

// Either async bundle can create the response promise, but only the external
// runtime starts the request. Hydration must not depend on their download order.
export function getClientResumeState(): ClientResumeState {
  let state = window.__NEXT_CLIENT_RESUME_STATE
  if (!state) {
    let resolve!: ClientResumeState['resolve']
    const response = new Promise<Response>((resolveResponse) => {
      resolve = resolveResponse
    })
    state = { response, resolve, started: false }
    window.__NEXT_CLIENT_RESUME_STATE = state
  }
  return state
}
