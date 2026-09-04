import type { ReactNode } from 'react'

declare global {
  namespace __NextRouteTypes {
    interface AppRoutesMap {}
    interface PageRoutesMap {}
    interface LayoutRoutesMap {}
    interface RedirectRoutesMap {}
    interface RewriteRoutesMap {}
    interface AppRouteHandlerRoutesMap {}
    interface ParamMap {}
    interface LayoutSlots {}
  }

  type AppRoutes = keyof __NextRouteTypes.AppRoutesMap
  type PageRoutes = keyof __NextRouteTypes.PageRoutesMap
  type LayoutRoutes = keyof __NextRouteTypes.LayoutRoutesMap
  type RedirectRoutes = keyof __NextRouteTypes.RedirectRoutesMap
  type RewriteRoutes = keyof __NextRouteTypes.RewriteRoutesMap
  type AppRouteHandlerRoutes = keyof __NextRouteTypes.AppRouteHandlerRoutesMap

  type Routes =
    | AppRoutes
    | PageRoutes
    | LayoutRoutes
    | RedirectRoutes
    | RewriteRoutes
    | AppRouteHandlerRoutes

  type LayoutSlotsOf<LayoutRoute extends string> = {
    [K in keyof __NextRouteTypes.LayoutSlots]: K extends `${LayoutRoute}#${infer Slot}`
      ? Slot
      : never
  }[keyof __NextRouteTypes.LayoutSlots]

  /**
   * Props for Next.js App Router page components
   * @example
   * ```tsx
   * export default function Page(props: PageProps<'/blog/[slug]'>) {
   *   const { slug } = await props.params
   *   return <div>Blog post: {slug}</div>
   * }
   * ```
   */
  interface PageProps<AppRoute extends AppRoutes = AppRoutes> {
    params: Promise<
      AppRoute extends keyof __NextRouteTypes.ParamMap
        ? __NextRouteTypes.ParamMap[AppRoute]
        : Record<string, string | string[] | undefined>
    >
    searchParams: Promise<Record<string, string | string[] | undefined>>
  }

  /**
   * Props for Next.js App Router layout components
   * @example
   * ```tsx
   * export default function Layout(props: LayoutProps<'/dashboard'>) {
   *   return <div>{props.children}</div>
   * }
   * ```
   */
  type LayoutProps<LayoutRoute extends LayoutRoutes = LayoutRoutes> = {
    params: Promise<
      LayoutRoute extends keyof __NextRouteTypes.ParamMap
        ? __NextRouteTypes.ParamMap[LayoutRoute]
        : Record<string, string | string[] | undefined>
    >
    children: ReactNode
  } & {
    [K in LayoutSlotsOf<LayoutRoute>]: ReactNode
  }
}

export {}
