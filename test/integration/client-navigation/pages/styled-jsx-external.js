import { pBlue } from '../lib/colored-blue'

const StyledJsxExternal = () => (
  <div>
    <p id="blue-box" className={pBlue.className}>
      This is blue
    </p>
    {pBlue.styles}
  </div>
)

export default StyledJsxExternal
