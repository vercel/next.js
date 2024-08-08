import { pBlue } from '../lib/colored-blue'
export default () => (
  <div>
    <p id="blue-box" className={pBlue.className}>
      This is blue
    </p>
    {pBlue.styles}
  </div>
)
