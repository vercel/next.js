import { AppRouterInstance } from '../app-router-context'
import { NextRouter } from './router'

/**
 * adaptForAppRouterInstance implements the AppRouterInstance with a NextRouter.
 */
export function adaptForAppRouterInstance(
  nextRouter: NextRouter
): AppRouterInstance {
  return {
    back(): void {
      nextRouter.back()
    },
    forward(): void {
      nextRouter.forward()
    },
    refresh(): void {
      nextRouter.reload()
    },
    push(href: string): void {
      void nextRouter.push(href)
    },
    replace(href: string): void {
      void nextRouter.replace(href)
    },
    prefetch(href: string): void {
      void nextRouter.prefetch(href)
    },
  }
}
