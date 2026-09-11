import * as React from 'react'
import Form from 'next/form'

// A value containing a lone LF and a value containing a lone CR.
// The HTML form submission algorithm normalizes both to CRLF before
// url-encoding them, so `<Form>` has to match that.
// https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#converting-an-entry-list-to-a-list-of-name-value-pairs
const LF_VALUE = 'line1\nline2'
const CR_VALUE = 'before\rafter'

export default function Home() {
  // The newlines are only mis-encoded after hydration, so the test needs to
  // wait for this marker before submitting.
  const [hydrated, setHydrated] = React.useState(false)
  React.useEffect(() => setHydrated(true), [])

  return (
    <>
      {hydrated ? <div id="hydrated">hydrated</div> : null}

      <Form action="/pages-dir/search" id="next-form">
        <textarea name="query" defaultValue={LF_VALUE} />
        <input type="hidden" name="cr" defaultValue={CR_VALUE} />
        <button type="submit" id="submit-next-form">
          Submit next/form
        </button>
      </Form>

      <form action="/pages-dir/search" method="get" id="native-form">
        <textarea name="query" defaultValue={LF_VALUE} />
        <input type="hidden" name="cr" defaultValue={CR_VALUE} />
        <button type="submit" id="submit-native-form">
          Submit native form
        </button>
      </form>
    </>
  )
}
