import { config as hello } from '../something'
import { config as world } from '../config'

// export const config = 'hello world'

export default () => (
  <p>
    {hello} {world}
  </p>
)
