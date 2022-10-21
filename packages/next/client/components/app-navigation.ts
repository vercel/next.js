import { useContext } from 'react'
import {
  AppRouterContext,
  AppRouterInstance,
} from '../../shared/lib/app-router-context'

/**
 * useAppRouter will get the AppRouterInstance on the context if it's mounted.
 * If it is not mounted, it will throw an error. This method should only be used
 * when you expect only to have the app router mounted (not pages router).
 *
 * @returns the app router instance
 */
export function useAppRouter(): AppRouterInstance {
  const router = useContext(AppRouterContext)
  if (!router) {
    throw new Error('invariant expected app router to be mounted')
  }

  return router
}
