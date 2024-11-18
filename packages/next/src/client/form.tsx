'use client'

import { useEffect, type HTMLProps, type FormEvent, useContext } from 'react'
import { addBasePath } from './add-base-path'
import { useIntersection } from './use-intersection'
import { useMergedRef } from './use-merged-ref'
import {
  AppRouterContext,
  type AppRouterInstance,
} from '../shared/lib/app-router-context.shared-runtime'
import { PrefetchKind } from './components/router-reducer/router-reducer-types'
import { RouterContext } from '../shared/lib/router-context.shared-runtime'
import type { NextRouter } from './router'

const DISALLOWED_FORM_PROPS = ['method', 'encType', 'target'] as const

type HTMLFormProps = HTMLProps<HTMLFormElement>
type DisallowedFormProps = (typeof DISALLOWED_FORM_PROPS)[number]

type InternalFormProps = {
  /**
   * `action` can be either a `string` or a function.
   * - If `action` is a string, it will be interpreted as a path or URL to navigate to when the form is submitted.
   *   The path will be prefetched when the form becomes visible.
   * - If `action` is a function, it will be called when the form is submitted. See the [React docs](https://react.dev/reference/react-dom/components/form#props) for more.
   */
  action: NonNullable<HTMLFormProps['action']>
  /**
   * Controls how the route specified by `action` is prefetched.
   * Any `<Form />` that is in the viewport (initially or through scroll) will be prefetched.
   * Prefetch can be disabled by passing `prefetch={false}`. Prefetching is only enabled in production.
   *
   * Options:
   * - `null` (default): For statically generated pages, this will prefetch the full React Server Component data. For dynamic pages, this will prefetch up to the nearest route segment with a [`loading.js`](https://nextjs.org/docs/app/api-reference/file-conventions/loading) file. If there is no loading file, it will not fetch the full tree to avoid fetching too much data.
   * - `false`: This will not prefetch any data.
   *
   * In pages dir, prefetching is not supported, and passing this prop will emit a warning.
   *
   * @defaultValue `null`
   */
  prefetch?: false | null
  /**
   * Whether submitting the form should replace the current `history` state instead of adding a new url into the stack.
   * Only valid if `action` is a string.
   *
   * @defaultValue `false`
   */
  replace?: boolean
  /**
   * Override the default scroll behavior when navigating.
   * Only valid if `action` is a string.
   *
   * @defaultValue `true`
   */
  scroll?: boolean
} & Omit<HTMLFormProps, 'action' | DisallowedFormProps>

// `RouteInferType` is a stub here to avoid breaking `typedRoutes` when the type
// isn't generated yet. It will be replaced when the webpack plugin runs.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type FormProps<RouteInferType = any> = InternalFormProps

export default function Form({
  replace,
  scroll,
  prefetch: prefetchProp,
  ref: externalRef,
  ...props
}: FormProps) {
  const router = useAppOrPagesRouter()

  const actionProp = props.action
  const isNavigatingForm = typeof actionProp === 'string'

  // Validate `action`
  if (process.env.NODE_ENV === 'development') {
    if (isNavigatingForm) {
      checkActionUrl(actionProp, 'action')
    }
  }

  // Validate `prefetch`
  if (process.env.NODE_ENV === 'development') {
    if (
      !(
        prefetchProp === undefined ||
        prefetchProp === false ||
        prefetchProp === null
      )
    ) {
      console.error('The `prefetch` prop of <Form> must be `false` or `null`')
    }

    if (prefetchProp !== undefined) {
      if (!isAppRouter(router)) {
        console.error(
          'Passing `prefetch` to a <Form> has no effect in the pages directory.'
        )
      } else if (!isNavigatingForm) {
        console.error(
          'Passing `prefetch` to a <Form> whose `action` is a function has no effect.'
        )
      }
    }
  }

  const prefetch =
    prefetchProp === false || prefetchProp === null ? prefetchProp : null

  // Validate `scroll` and `replace`
  if (process.env.NODE_ENV === 'development') {
    if (!isNavigatingForm && (replace !== undefined || scroll !== undefined)) {
      console.error(
        'Passing `replace` or `scroll` to a <Form> whose `action` is a function has no effect.\n' +
          'See the relevant docs to learn how to control this behavior for navigations triggered from actions:\n' +
          '  `redirect()`       - https://nextjs.org/docs/app/api-reference/functions/redirect#parameters\n' +
          '  `router.replace()` - https://nextjs.org/docs/app/api-reference/functions/use-router#userouter\n'
      )
    }
  }

  // Clean up any unsupported form props (and warn if present)
  for (const key of DISALLOWED_FORM_PROPS) {
    if (key in props) {
      if (process.env.NODE_ENV === 'development') {
        console.error(
          `<Form> does not support changing \`${key}\`. ` +
            (isNavigatingForm
              ? `If you'd like to use it to perform a mutation, consider making \`action\` a function instead.\n` +
                `Learn more: https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations`
              : '')
        )
      }
      delete (props as Record<string, unknown>)[key]
    }
  }

  const isPrefetchEnabled =
    // there is no notion of instant loading states in pages dir, so prefetching is pointless
    isAppRouter(router) &&
    // if we don't have an action path, we can't preload anything anyway.
    isNavigatingForm &&
    prefetch === null

  const [setIntersectionRef, isVisible] = useIntersection({
    rootMargin: '200px',
    disabled: !isPrefetchEnabled,
  })

  const ownRef = useMergedRef<HTMLFormElement>(
    setIntersectionRef,
    externalRef ?? null
  )

  useEffect(() => {
    if (!isVisible || !isPrefetchEnabled) {
      return
    }

    try {
      const prefetchKind = PrefetchKind.AUTO
      router.prefetch(actionProp, { kind: prefetchKind })
    } catch (err) {
      console.error(err)
    }
  }, [isPrefetchEnabled, isVisible, actionProp, prefetch, router])

  if (!isNavigatingForm) {
    return <form {...props} ref={ownRef} />
  }

  const actionHref = addBasePath(actionProp)

  return (
    <form
      {...props}
      ref={ownRef}
      action={actionHref}
      onSubmit={(event) =>
        onFormSubmit(event, {
          router,
          actionHref,
          replace,
          scroll,
          onSubmit: props.onSubmit,
        })
      }
    />
  )
}

function onFormSubmit(
  event: FormEvent<HTMLFormElement>,
  {
    actionHref,
    onSubmit,
    replace,
    scroll,
    router,
  }: {
    actionHref: string
    onSubmit: FormProps['onSubmit']
    replace: FormProps['replace']
    scroll: FormProps['scroll']
    router: SomeRouter
  }
) {
  if (typeof onSubmit === 'function') {
    onSubmit(event)

    // if the user called event.preventDefault(), do nothing.
    // (this matches what Link does for `onClick`)
    if (event.defaultPrevented) {
      return
    }
  }

  const formElement = event.currentTarget
  const submitter = (event.nativeEvent as SubmitEvent).submitter

  let action = actionHref

  if (submitter) {
    if (process.env.NODE_ENV === 'development') {
      // the way server actions are encoded (e.g. `formMethod="post")
      // causes some unnecessary dev-mode warnings from `hasUnsupportedSubmitterAttributes`.
      // we'd bail out anyway, but we just do it silently.
      if (hasReactServerActionAttributes(submitter)) {
        return
      }
    }

    if (hasUnsupportedSubmitterAttributes(submitter)) {
      return
    }

    // client actions have `formAction="javascript:..."`. We obviously can't prefetch/navigate to that.
    if (hasReactClientActionAttributes(submitter)) {
      return
    }

    // If the submitter specified an alternate formAction,
    // use that URL instead -- this is what a native form would do.
    // NOTE: `submitter.formAction` is unreliable, because it will give us `location.href` if it *wasn't* set
    // NOTE: this should not have `basePath` added, because we can't add it before hydration
    const submitterFormAction = submitter.getAttribute('formAction')
    if (submitterFormAction !== null) {
      if (process.env.NODE_ENV === 'development') {
        checkActionUrl(submitterFormAction, 'formAction')
      }
      action = submitterFormAction
    }
  }

  let targetUrl: URL
  try {
    // NOTE: It might be more correct to resolve URLs relative to `document.baseURI`,
    // but we already do it relative to `location.href` elsewhere:
    //  (see e.g. https://github.com/vercel/next.js/blob/bb0e6722f87ceb2d43015f5b8a413d0072f2badf/packages/next/src/client/components/app-router.tsx#L146)
    // so it's better to stay consistent.
    const base = window.location.href
    targetUrl = new URL(action, base)
  } catch (err) {
    throw new Error(`Cannot parse form action "${action}" as a URL`, {
      cause: err,
    })
  }
  if (targetUrl.searchParams.size) {
    // url-encoded HTML forms *overwrite* any search params in the `action` url:
    //
    //  "Let `query` be the result of running the application/x-www-form-urlencoded serializer [...]"
    //  "Set parsed action's query component to `query`."
    //   https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#submit-mutate-action
    //
    // We need to match that.
    // (note that all other parts of the URL, like `hash`, are preserved)
    targetUrl.search = ''
  }

  const formData = new FormData(formElement)

  for (let [name, value] of formData) {
    if (typeof value !== 'string') {
      // For file inputs, the native browser behavior is to use the filename as the value instead:
      //
      //   "If entry's value is a File object, then let value be entry's value's name. Otherwise, let value be entry's value."
      //   https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#converting-an-entry-list-to-a-list-of-name-value-pairs
      //
      if (process.env.NODE_ENV === 'development') {
        console.warn(
          `<Form> only supports file inputs if \`action\` is a function. File inputs cannot be used if \`action\` is a string, ` +
            `because files cannot be encoded as search params.`
        )
      }
      value = value.name
    }

    targetUrl.searchParams.append(name, value)
  }

  // Finally, no more reasons for bailing out.
  event.preventDefault()

  const method = replace ? 'replace' : 'push'
  const targetHref = targetUrl.href
  if (isAppRouter(router)) {
    router[method](targetHref, { scroll })
  } else {
    // TODO(form): Make this use a transition so that pending states work
    //
    // Unlike the app router, pages router doesn't use startTransition,
    // and can't easily be wrapped in one because of implementation details
    // (e.g. it doesn't use any react state)
    // But it's important to have this wrapped in a transition because
    // pending states from e.g. `useFormStatus` rely on that.
    // So this needs some follow up work.
    router[method](targetHref, undefined, { scroll })
  }
}

type SomeRouter = AppRouterInstance | NextRouter

function isAppRouter(router: SomeRouter): router is AppRouterInstance {
  return !('asPath' in router)
}

function useAppOrPagesRouter(): SomeRouter {
  const pagesRouter = useContext(RouterContext)
  const appRouter = useContext(AppRouterContext)
  if (pagesRouter) {
    return pagesRouter
  } else {
    // We're in the app directory if there is no pages router.
    return appRouter!
  }
}

function checkActionUrl(action: string, source: 'action' | 'formAction') {
  const aPropName = source === 'action' ? `an \`action\`` : `a \`formAction\``

  let testUrl: URL
  try {
    testUrl = new URL(action, 'http://n')
  } catch (err) {
    console.error(
      `<Form> received ${aPropName} that cannot be parsed as a URL: "${action}".`
    )
    return
  }

  // url-encoded HTML forms ignore any queryparams in the `action` url. We need to match that.
  if (testUrl.searchParams.size) {
    console.warn(
      `<Form> received ${aPropName} that contains search params: "${action}". This is not supported, and they will be ignored. ` +
        `If you need to pass in additional search params, use an \`<input type="hidden" />\` instead.`
    )
  }
}

const isSupportedEncType = (value: string) =>
  value === 'application/x-www-form-urlencoded'
const isSupportedMethod = (value: string) => value === 'get'
const isSupportedTarget = (value: string) => value === '_self'

function hasUnsupportedSubmitterAttributes(submitter: HTMLElement): boolean {
  // A submitter can override `encType` for the form.
  const formEncType = submitter.getAttribute('formEncType')
  if (formEncType !== null && !isSupportedEncType(formEncType)) {
    if (process.env.NODE_ENV === 'development') {
      console.error(
        `<Form>'s \`encType\` was set to an unsupported value via \`formEncType="${formEncType}"\`. ` +
          `This will disable <Form>'s navigation functionality. If you need this, use a native <form> element instead.`
      )
    }
    return true
  }

  // A submitter can override `method` for the form.
  const formMethod = submitter.getAttribute('formMethod')
  if (formMethod !== null && !isSupportedMethod(formMethod)) {
    if (process.env.NODE_ENV === 'development') {
      console.error(
        `<Form>'s \`method\` was set to an unsupported value via \`formMethod="${formMethod}"\`. ` +
          `This will disable <Form>'s navigation functionality. If you need this, use a native <form> element instead.`
      )
    }
    return true
  }

  // A submitter can override `target` for the form.
  const formTarget = submitter.getAttribute('formTarget')
  if (formTarget !== null && !isSupportedTarget(formTarget)) {
    if (process.env.NODE_ENV === 'development') {
      console.error(
        `<Form>'s \`target\` was set to an unsupported value via \`formTarget="${formTarget}"\`. ` +
          `This will disable <Form>'s navigation functionality. If you need this, use a native <form> element instead.`
      )
    }
    return true
  }

  return false
}

function hasReactServerActionAttributes(submitter: HTMLElement) {
  // https://github.com/facebook/react/blob/942eb80381b96f8410eab1bef1c539bed1ab0eb1/packages/react-client/src/ReactFlightReplyClient.js#L931-L934
  const name = submitter.getAttribute('name')
  return (
    name && (name.startsWith('$ACTION_ID_') || name.startsWith('$ACTION_REF_'))
  )
}

function hasReactClientActionAttributes(submitter: HTMLElement) {
  // CSR: https://github.com/facebook/react/blob/942eb80381b96f8410eab1bef1c539bed1ab0eb1/packages/react-dom-bindings/src/client/ReactDOMComponent.js#L482-L487
  // SSR: https://github.com/facebook/react/blob/942eb80381b96f8410eab1bef1c539bed1ab0eb1/packages/react-dom-bindings/src/client/ReactDOMComponent.js#L2401
  const action = submitter.getAttribute('formAction')
  return action && /\s*javascript:/i.test(action)
}
