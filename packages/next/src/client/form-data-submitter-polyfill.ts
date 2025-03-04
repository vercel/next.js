import { useLayoutEffect } from 'react'

/**
 * A polyfill for the submitter param of `new FormData(form, submitter)` which is not supported everywhere yet
 * (~90% of users as of March 2025: https://caniuse.com/mdn-api_formdata_formdata_submitter)
 */
export function createFormData(
  formElement: HTMLFormElement,
  submitterElement: HTMLElement | null
): FormData {
  if (isFormDataSubmitterParamSupported()) {
    return new FormData(formElement, submitterElement)
  } else {
    if (!submitterElement) {
      return new FormData(formElement)
    }
    return createFormDataWithSubmitter(
      formElement,
      submitterElement as HTMLInputElement | HTMLButtonElement
    )
  }
}

let _isFormDataSubmitterParamSupported: boolean | undefined

/** Feature detect whether this browser supports `new FormData(formElement, submitterElement)` */
function isFormDataSubmitterParamSupported(): boolean {
  if (_isFormDataSubmitterParamSupported === undefined) {
    _isFormDataSubmitterParamSupported = isFormDataSubmitterParamSupportedImpl()
  }
  return _isFormDataSubmitterParamSupported
}

function isFormDataSubmitterParamSupportedImpl(): boolean {
  const formElement = document.createElement('form')

  const submitterElement = document.createElement('input')
  submitterElement.type = 'submit'
  submitterElement.name = 'test_name'
  submitterElement.value = 'test_value'

  // the submitter should be a child of the form, otherwise we'll get "DOMException: The submitter is not owned by this form"
  formElement.appendChild(submitterElement)

  let formData = undefined
  try {
    // if the second param is unsupported, it could throw...
    formData = new FormData(formElement, submitterElement)
  } catch (err) {
    return false
  }
  // or it could just be silently ignored, in which case it won't be present in the form data
  return formData.get(submitterElement.name) === submitterElement.value
}

/**
 * based on: https://github.com/facebook/react/blob/d4e24b349e6530a8e6c95d79ad40b32f93b47070/packages/react-dom-bindings/src/events/plugins/FormActionEventPlugin.js#L48-L70
 */
function createFormDataWithSubmitter(
  formElement: HTMLFormElement,
  submitterElement: HTMLInputElement | HTMLButtonElement
) {
  if (isImageInputElement(submitterElement)) {
    // `<input type="image">` is a special case.
    // The formData should contain two fields, `${name}.x` and `${name}.y`,
    // that hold the (relative) x and y coordinates of the click that initiated the submission.
    let clickCoords = getPolyfilledClickCoordsFromImageInput(submitterElement)

    if (!clickCoords) {
      console.error(
        'Failed to polyfill click coordinates for <input type="image">'
      )
      // For some reason, the click-tracking part of our polyfill didn't work.
      // As a fallback, we can use dummy values of x: 0, y: 0 --
      // That's what they'd be if the input is triggered using the keyboard
      // or if the image failed to load, so it's a case that the consumer of the FormData has to handle anyway,
      // and it's arguably less surprising than if we didn't include the params at all.
      clickCoords = { clientX: 0, clientY: 0 }
    }

    const rect = submitterElement.getBoundingClientRect()
    const x = Math.round(clickCoords.clientX - rect.left)
    const y = Math.round(clickCoords.clientY - rect.top)

    const name = submitterElement.getAttribute('name')
    const nameX = name ? name + '.x' : 'x'
    const nameY = name ? name + '.y' : 'y'
    return createFormDataWithSubmitterValues(formElement, submitterElement, [
      [nameX, x + ''],
      [nameY, y + ''],
    ])
  } else {
    // A regular input or button -- just add its name and value to the formData.
    return createFormDataWithSubmitterValues(formElement, submitterElement, [
      [submitterElement.name, submitterElement.value],
    ])
  }
}

function createFormDataWithSubmitterValues(
  formElement: HTMLFormElement,
  submitterElement: HTMLInputElement | HTMLButtonElement,
  values: [name: string, value: string][]
) {
  // The submitter's value should be included in the FormData.
  // It should be in the document order in the form.
  // Since the FormData constructor invokes the formdata event it also
  // needs to be available before that happens so after construction it's too
  // late. We use a temporary fake node for the duration of this event.

  const tempInputs: Element[] = []
  for (const [name, value] of values) {
    const temp = submitterElement.ownerDocument.createElement('input')
    temp.type = 'hidden'
    temp.name = name
    temp.value = value
    if (formElement.id) {
      // If the `submitterElement` is outside the form,
      // it had to be connected via id, so this will ensure that our
      // dummy inputs are connected to it in the same way.
      temp.setAttribute('form', formElement.id)
    }
    submitterElement.parentNode!.insertBefore(temp, submitterElement)
    tempInputs.push(temp)
  }

  const formData = new FormData(formElement)

  for (const temp of tempInputs) {
    temp.parentNode!.removeChild(temp)
  }

  return formData
}

//========================================================
// click coordinates polyfill for `<input type="image">`
//========================================================

let mountedFormCount = 0
export function useImageInputCoordsPolyfill() {
  useLayoutEffect(() => {
    // If `new FormData(formElement, submitterElement)` works,
    // then `<input type="image">` click coords will be handled there,
    // so we don't need the polyfill.
    if (isFormDataSubmitterParamSupported()) {
      return
    }

    // If we're the first <Form> on the page, set up the polyfill.
    if (mountedFormCount === 0) {
      setupImageInputClickPolyfill()
    }
    mountedFormCount++

    return () => {
      mountedFormCount--
      // If we were the last <Form> on the page, the polyfill is no longer needed.
      // Clean it up, but do it after a grace period to avoid repeatedly uninstalling and reinstalling.
      // (e.g. when we have one form on the page and its react key changes)
      if (mountedFormCount === 0) {
        setTimeout(() => {
          if (mountedFormCount === 0) {
            cleanupImageInputCoordsPolyfill()
          }
        }, 100)
      }
    }
  }, [])
}

type ImageInputPolyfillState =
  | { isActive: false; cleanup: undefined }
  | { isActive: true; cleanup: () => void }

let polyfillState: ImageInputPolyfillState = {
  isActive: false,
  cleanup: undefined,
}

function setupImageInputClickPolyfill() {
  if (polyfillState.isActive) {
    return
  }

  const cleanupRaw = setupImageInputCoordsPolyfillImpl()
  const cleanup = () => {
    polyfillState = { isActive: false, cleanup: undefined }
    cleanupRaw()
  }
  polyfillState = { isActive: true, cleanup }
}

function cleanupImageInputCoordsPolyfill() {
  if (!polyfillState.isActive) {
    return
  }
  polyfillState.cleanup()
}

function setupImageInputCoordsPolyfillImpl() {
  // When we're in a submit event, we have no way of knowing where the `<input type="image">` was clicked.
  // So we need to track clicks as they happen, and stash them on the element to be retrieved during the submit.
  //
  // Note that this will also get triggered when the input is submitted using the keyboard
  // (with `{ clientX: 0, clientY: 0 }`, same as when `<input type="image">` is triggered via keyboard)
  const onClick = (clickEvent: MouseEvent) => {
    const target = clickEvent.target
    if (
      typeof target === 'object' &&
      target &&
      target instanceof HTMLElement &&
      isImageInputElement(target)
    ) {
      const coords = {
        clientX: clickEvent.clientX,
        clientY: clickEvent.clientY,
      }
      target[LAST_CLICKED_COORDS] = coords
      setTimeout(() => {
        // this will last long enough to be usable in the submit event, and disappear after
        // so that we're not accidentally left with a stale value
        if (target[LAST_CLICKED_COORDS] === coords) {
          target[LAST_CLICKED_COORDS] = undefined
        }
      })
    }
  }

  window.addEventListener('click', onClick, /* passive */ true)
  const cleanup = () => {
    window.removeEventListener('click', onClick, /* passive */ true)
  }
  return cleanup
}

const LAST_CLICKED_COORDS = Symbol('LAST_CLICKED_COORDS')

type InputImageElement = HTMLInputElement & {
  type: 'image'
  [LAST_CLICKED_COORDS]?: { clientX: number; clientY: number }
}

function isImageInputElement(
  element: HTMLElement
): element is InputImageElement {
  return (
    element.nodeName === 'INPUT' &&
    (element as HTMLInputElement).type === 'image'
  )
}

function getPolyfilledClickCoordsFromImageInput(element: InputImageElement) {
  return element[LAST_CLICKED_COORDS]
}
