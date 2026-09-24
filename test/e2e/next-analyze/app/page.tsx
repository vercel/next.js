import {
  fifth,
  first,
  fourth,
  second,
  seventh,
  sixth,
  third,
} from './transitive-effect'
import { used } from './values'

export default function Page() {
  return (
    <div>
      {[used, first, second, third, fourth, fifth, sixth, seventh].join(' ')}
    </div>
  )
}
