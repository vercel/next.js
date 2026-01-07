import type { HTMLProps } from 'react'

export const DISALLOWED_FORM_PROPS = ['method', 'encType', 'target'] as const

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
   * - "auto", null, undefined (default): For statically generated pages, this will prefetch the full React Server Component data. For dynamic pages, this will prefetch up to the nearest route segment with a [`loading.js`](https://nextjs.org/docs/app/api-reference/file-conventions/loading) file. If there is no loading file, it will not fetch the full tree to avoid fetching too much data.
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
// isn't generated yet. It will be replaced when type generation runs.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type FormProps<RouteInferType = any> = InternalFormProps

export function createFormSubmitDestinationUrl(
  action: string,
  formElement: HTMLFormElement
) {
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
  return targetUrl
}

export function checkFormActionUrl(
  action: string,
  source: 'action' | 'formAction'
) {
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

export const isSupportedFormEncType = (value: string) =>
  value === 'application/x-www-form-urlencoded'
export const isSupportedFormMethod = (value: string) => value === 'get'
export const isSupportedFormTarget = (value: string) => value === '_self'

export function hasUnsupportedSubmitterAttributes(
  submitter: HTMLElement
): boolean {
  // A submitter can override `encType` for the form.
  const formEncType = submitter.getAttribute('formEncType')
  if (formEncType !== null && !isSupportedFormEncType(formEncType)) {
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
  if (formMethod !== null && !isSupportedFormMethod(formMethod)) {
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
  if (formTarget !== null && !isSupportedFormTarget(formTarget)) {
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

export function hasReactClientActionAttributes(submitter: HTMLElement) {
  // CSR: https://github.com/facebook/react/blob/942eb80381b96f8410eab1bef1c539bed1ab0eb1/packages/react-dom-bindings/src/client/ReactDOMComponent.js#L482-L487
  // SSR: https://github.com/facebook/react/blob/942eb80381b96f8410eab1bef1c539bed1ab0eb1/packages/react-dom-bindings/src/client/ReactDOMComponent.js#L2401
  const action = submitter.getAttribute('formAction')
  return action && /\s*javascript:/i.test(action)
}
