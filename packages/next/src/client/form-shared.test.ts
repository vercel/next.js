/**
 * @jest-environment jsdom
 */
import { createFormSubmitDestinationUrl } from './form-shared'

function createFormWithTextarea(value: string): HTMLFormElement {
  const form = document.createElement('form')
  const textarea = document.createElement('textarea')
  textarea.name = 'text'
  textarea.value = value
  form.appendChild(textarea)
  document.body.appendChild(form)
  return form
}

describe('createFormSubmitDestinationUrl', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('normalizes lone LF in textarea values to CRLF like a native form submission', () => {
    const form = createFormWithTextarea('line1\nline2')
    const url = createFormSubmitDestinationUrl('/search', form)
    expect(url.searchParams.get('text')).toBe('line1\r\nline2')
  })

  it('normalizes lone CR in textarea values to CRLF', () => {
    const form = createFormWithTextarea('line1\rline2')
    const url = createFormSubmitDestinationUrl('/search', form)
    expect(url.searchParams.get('text')).toBe('line1\r\nline2')
  })

  it('leaves existing CRLF pairs untouched', () => {
    const form = createFormWithTextarea('line1\r\nline2')
    const url = createFormSubmitDestinationUrl('/search', form)
    expect(url.searchParams.get('text')).toBe('line1\r\nline2')
  })

  it('normalizes mixed newline styles consistently', () => {
    const form = createFormWithTextarea('a\nb\rc\r\nd')
    const url = createFormSubmitDestinationUrl('/search', form)
    expect(url.searchParams.get('text')).toBe('a\r\nb\r\nc\r\nd')
  })

  it('leaves values without newlines unchanged', () => {
    const form = createFormWithTextarea('no newlines here')
    const url = createFormSubmitDestinationUrl('/search', form)
    expect(url.searchParams.get('text')).toBe('no newlines here')
  })
})
