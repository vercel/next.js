import { title, items } from './file.test-file'

export default function Page() {
  return (
    <div>
      <p id="title">{title}</p>
      <p id="items">{items}</p>
    </div>
  )
}
