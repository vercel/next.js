import * as React from 'react'
import Form from 'next/form'

function textImg(text: string) {
  return `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 20 20'><text y='.9em' font-size='16'>${text}</text></svg>`
}

export default function Page() {
  return (
    <Form action="/pages-dir/search" id="search-form">
      <input
        id="submit-btn-one"
        type="image"
        src={textImg('1️⃣')}
        alt="1"
        name="buttonOne"
      />
      <input
        id="submit-btn-two"
        type="image"
        src={textImg('2️⃣')}
        alt="2"
        name="buttonTwo"
      />
    </Form>
  )
}
