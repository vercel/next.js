'use cache'

// This file simulates adding a "use cache" directive to a client module that's
// mistaken as a server module. It does not have itself a "use client"
// directive, but is imported by a client module with a "use client" directive,
// while also importing another client module with a "use client" directive.
// Adding the "use cache" directive here, effectively forces the module to be a
// server module, which then results in an error when trying to call the client
// function.

import { useStuff } from './client-module'

export async function useCachedStuff() {
  // Intentional misusage (using hooks in async functions).
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useStuff()
}
