import { GoogleAnalytics } from '@next/third-parties/google'
import Form from 'next/form'
import { submitAction } from './actions'

export default function Page() {
  return (
    <div className="container">
      <GoogleAnalytics gaId="GA-XYZ" />
      <h1>GA form</h1>

      {/* Client-side navigation submit (next/form preventDefaults). */}
      <Form action="/ga-form-dest" id="nav-form">
        <label htmlFor="nav-input">Input</label>
        <input type="text" name="input" id="nav-input" defaultValue="hello" />
        <button type="submit" id="nav-submit">
          Go
        </button>
      </Form>

      {/* Server action submit (React preventDefaults). */}
      <Form action={submitAction} id="action-form">
        <label htmlFor="action-input">Input</label>
        <input type="text" name="input" id="action-input" defaultValue="hi" />
        <button type="submit" id="action-submit">
          Submit
        </button>
      </Form>
    </div>
  )
}
