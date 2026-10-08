import { used } from './values'
import { shadowed } from './unrelated'

export async function outer(value: string) {
  const cache = async (shadowed: string) => {
    'use cache'
    function local(suffix: string) {
      return used(value + shadowed + suffix)
    }
    return <p>{local('!')}</p>
  }
  return cache('test')
}
