import { utilFn } from '../utils/file-to-transform'
import postcssOutput from '../utils/file.postcss-test'
import stylusOutput from '../utils/file.stylus-test'

export default function Page() {
  return (
    <>
      <p>{utilFn()}</p>
      <p id="postcss-output">{postcssOutput}</p>
      <p id="stylus-output">{stylusOutput}</p>
    </>
  )
}
