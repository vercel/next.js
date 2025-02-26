'use client'

import { useCallback, type FormEvent, useContext } from 'react'
import { addBasePath } from '../add-base-path'
import { useMergedRef } from '../use-merged-ref'
import {
  AppRouterContext,
  type AppRouterInstance,
} from '../../shared/lib/app-router-context.shared-runtime'
import { PrefetchKind } from '../components/router-reducer/router-reducer-types'
import {
  checkFormActionUrl,
  createFormSubmitDestinationUrl,
  DISALLOWED_FORM_PROPS,
  hasReactClientActionAttributes,
  hasUnsupportedSubmitterAttributes,
  type FormProps,
} from '../form-shared'
import { mountLinkInstance, unmountLinkInstance } from '../components/links'

export type { FormProps }

export default function Form({
  replace,
  scroll,
  prefetch: prefetchProp,
  ref: externalRef,
  ...props
}: FormProps) {
  const router = useContext(AppRouterContext)

  const actionProp = props.action
  const isNavigatingForm = typeof actionProp === 'string'

  // Validate `action`
  if (process.env.NODE_ENV === 'development') {
    if (isNavigatingForm) {
      checkFormActionUrl(actionProp, 'action')
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

    if (prefetchProp !== undefined && !isNavigatingForm) {
      console.error(
        'Passing `prefetch` to a <Form> whose `action` is a function has no effect.'
      )
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
    // if we don't have an action path, we can't prefetch anything.
    !!router && isNavigatingForm && prefetch === null

  const observeFormVisibilityOnMount = useCallback(
    (element: HTMLFormElement) => {
      if (isPrefetchEnabled && router !== null) {
        mountLinkInstance(element, actionProp, router, PrefetchKind.AUTO)
      }
      return () => {
        unmountLinkInstance(element)
      }
    },
    [isPrefetchEnabled, actionProp, router]
  )

  const mergedRef = useMergedRef(
    observeFormVisibilityOnMount,
    externalRef ?? null
  )

  if (!isNavigatingForm) {
    return <form {...props} ref={mergedRef} />
  }

  const actionHref = addBasePath(actionProp)

  return (
    <form
      {...props}
      ref={mergedRef}
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
    router: AppRouterInstance | null
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

  if (!router) {
    // Form was somehow used outside of the router (but not in pages, the implementation is forked!).
    // We can't perform a soft navigation, so let the native submit handling do its thing.
    return
  }

  const formElement = event.currentTarget
  const submitterElement = (event.nativeEvent as SubmitEvent).submitter

  if (submitterElement) {
    if (process.env.NODE_ENV === 'development') {
      // the way server actions are encoded (e.g. `formMethod="post")
      // causes some unnecessary dev-mode warnings from `hasUnsupportedSubmitterAttributes`.
      // we'd bail out anyway, but we just do it silently.
      if (hasReactServerActionAttributes(submitterElement)) {
        return
      }
    }

    if (hasUnsupportedSubmitterAttributes(submitterElement)) {
      return
    }

    // client actions have `formAction="javascript:..."`. We obviously can't prefetch/navigate to that.
    if (hasReactClientActionAttributes(submitterElement)) {
      return
    }
  }

  const targetUrl = createFormSubmitDestinationUrl(
    actionHref,
    formElement,
    submitterElement
  )

  // Finally, no more reasons for bailing out.
  event.preventDefault()

  const method = replace ? 'replace' : 'push'
  const targetHref = targetUrl.href
  router[method](targetHref, { scroll })
}

function hasReactServerActionAttributes(submitter: HTMLElement) {
  // https://github.com/facebook/react/blob/942eb80381b96f8410eab1bef1c539bed1ab0eb1/packages/react-client/src/ReactFlightReplyClient.js#L931-L934
  const name = submitter.getAttribute('name')
  return (
    name && (name.startsWith('$ACTION_ID_') || name.startsWith('$ACTION_REF_'))
  )
}
