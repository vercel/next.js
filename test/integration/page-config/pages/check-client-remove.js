import { config as hello } from '../something'
import { config as world } from '../config'

export const config = { _unknownKey: 'THIS_VALUE_SHOULD_BE_GONE' }

export default () => (
  <p>
    {hello} {world}
  </p>
)
