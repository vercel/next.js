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
  form: HTMLFormElement,
  submitter: HTMLInputElement | HTMLButtonElement
): FormData {
  // The submitter's value should be included in the FormData.
  // It should be in the document order in the form.
  // Since the FormData constructor invokes the formdata event it also
  // needs to be available before that happens so after construction it's too
  // late. We use a temporary fake node for the duration of this event.

  if (submitter.nodeName === 'INPUT' && submitter.type === 'image') {
    // When a form is submitted via an `<input type="image">`, we should add the x and y coordinates of the click to the form data.
    // (see: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/image#using_the_x_and_y_data_points)
    // A polyfill for this behavior is complicated, and will be handled in a follow up.
    return new FormData(form)
  }

  const temp = submitter.ownerDocument.createElement('input')
  temp.name = submitter.name
  temp.value = submitter.value
  if (form.id) {
    temp.setAttribute('form', form.id)
  }
  submitter.parentNode!.insertBefore(temp, submitter)
  const formData = new FormData(form)
  temp.parentNode!.removeChild(temp)
  return formData
}
