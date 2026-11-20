import {
  resourcePath,
  resourceFragment,
  message,
} from './#/nested/item.custom.js'

export default function Page() {
  return (
    <div>
      <p id="message">{message}</p>
      <p id="path">{resourcePath}</p>
      <p id="fragment">{resourceFragment}</p>
    </div>
  )
}
