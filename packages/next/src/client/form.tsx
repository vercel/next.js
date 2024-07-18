'use client'

import { useEffect, type HTMLProps, type FormEvent } from 'react'
import { useRouter } from './components/navigation'

const isSupportedEncType = (value: string) =>
  value === 'application/x-www-form-urlencoded'
const isSupportedMethod = (value: string) => value === 'get'
const isSupportedTarget = (value: string) => value === '_self'

type HTMLFormProps = HTMLProps<HTMLFormElement>
export type FormProps = Omit<HTMLFormProps, 'action'> &
  Required<Pick<HTMLFormProps, 'action'>> & { replace?: boolean }

export default function Form({ replace, ...props }: FormProps) {
  const actionProp = props.action
  const router = useRouter()

  useEffect(() => {
    if (typeof actionProp === 'string') {
      try {
        // TODO: do we need to take the current field values here?
        // or are we assuming that queryparams can't affect this (but what about rewrites)?
        router.prefetch(actionProp)
      } catch (err) {
        console.error(err)
      }
    }
  }, [actionProp, router])

  if (
    typeof actionProp !== 'string' ||
    // TODO: should we warn here? or maybe just make these an error?
    (props.encType && !isSupportedEncType(props.encType)) ||
    (props.method && !isSupportedMethod(props.method)) ||
    (props.target && !isSupportedTarget(props.target))
  ) {
    return <form {...props} />
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    const formElement = event.currentTarget
    const submitter = (event.nativeEvent as SubmitEvent).submitter

    let action = actionProp

    if (submitter) {
      if (submitterHasUnsupportedProperty(submitter)) {
        return
      }

      // If the submitter specified an alternate formAction,
      // use that URL instead -- this is what a native form would do.
      // TODO: ...but what if the formAction is a server action? will that still have a string prop after hydration?
      if (
        'formAction' in submitter &&
        typeof submitter['formAction'] === 'string'
      ) {
        const overriddenFormAction = submitter.formAction
        if (overriddenFormAction !== action) {
          action = overriddenFormAction
        }
      }
    }

    // TODO: is it a problem that we've got an absolute URL here?
    // can that cause any problems with e.g. basePath?
    // WHAT about <base>, is that something we're handling at all?

    const targetUrl = new URL(action, window.location.origin)
    if (targetUrl.searchParams.size) {
      // url-encoded HTML forms ignore any queryparams in the `action` url. We need to match that.
      // (note that all other parts of the URL, like `hash`, are preserved)
      targetUrl.search = ''
    }

    const formData = new FormData(formElement)

    for (const [name, value] of formData) {
      if (typeof value !== 'string') {
        // if it's not a string, then it was a file input.
        // we can't do anything with those.
        if (process.env.NODE_ENV === 'development') {
          console.error(
            'next/form does not support file inputs. Use a native <form> instead.'
          )
        }

        return
      }

      targetUrl.searchParams.append(name, value)
    }

    // Finally, no more reasons for bailing out.
    event.preventDefault()

    try {
      const { onSubmit: userOnSubmit } = props
      userOnSubmit?.(event)
    } catch (err) {
      console.error(err)
    }

    const method = replace ? 'replace' : 'push'

    router[method](targetUrl.href)
  }

  return <form {...props} onSubmit={onSubmit} />
}

function submitterHasUnsupportedProperty(submitter: HTMLElement): boolean {
  // A submitter can override `encType` for the form.
  if (
    'formEncType' in submitter &&
    typeof submitter['formEncType'] === 'string' &&
    submitter['formEncType'] &&
    !isSupportedEncType(submitter['formEncType'])
  ) {
    if (process.env.NODE_ENV === 'development') {
      console.error(
        `next/form's \`encType\` was set to an unsupported value via \`formEncType="${submitter['formEncType']}"\`. Use a native <form> instead.`
      )
    }
    return true
  }

  // A submitter can override `method` for the form.
  if (
    'formMethod' in submitter &&
    typeof submitter['formMethod'] === 'string' &&
    submitter['formMethod'] &&
    !isSupportedMethod(submitter['formMethod'])
  ) {
    if (process.env.NODE_ENV === 'development') {
      console.error(
        `next/form's \`method\` was set to an unsupported value via \`formMethod="${submitter['formMethod']}"\`. Use a native <form> instead.`
      )
    }
    return true
  }

  // A submitter can override `target` for the form.
  if (
    'formTarget' in submitter &&
    typeof submitter['formTarget'] === 'string' &&
    submitter['formTarget'] &&
    !isSupportedTarget(submitter['formTarget'])
  ) {
    if (process.env.NODE_ENV === 'development') {
      console.error(
        `next/form's \`target\` was set to an unsupported value via \`formTarget="${submitter['formTarget']}"\`. Use a native <form> instead.`
      )
    }
    return true
  }

  return false
}
