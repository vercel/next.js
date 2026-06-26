import { useContext } from 'react'
import { RouterContext } from '../../shared/lib/router-context.shared-runtime'
import type { NextRouter } from '../router'

/**
 * useRouter from `next/compat/router` is designed to assist developers
 * migrating from `pages/` to `app/`. Unlike `next/router`, this hook does not
 * throw when the `NextRouter` is not mounted, and instead returns `null`. The
 * more concrete return type here lets developers use this hook within
 * components that could be shared between both `app/` and `pages/` and handle
 * to the case where the router is not mounted.
 *
 * @returns The `NextRouter` instance if it's available, otherwise `null`.
 */
export function useRouter(): NextRouter | null {
  return useContext(RouterContext)
}
