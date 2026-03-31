import { font3 } from '../../fonts'

export default function Component() {
  return (
    <p id="root-comp" className={font3.className}>
      {JSON.stringify(font3)}
    </p>
  )
}
