import { getValue as directRead } from './direct-read'
import { getValue as directExistence } from './direct-existence'
import { getValue as transitiveRead } from './transitive-read'
import { getValue as transitiveExistence } from './transitive-existence'
import { getValue as nestedCacheRead } from './nested-cache-read'
import { getValue as nestedCacheExistence } from './nested-cache-existence'
import { getValue as moduleLevel } from './module-level'
import { getValue as dependencyCycle } from './dependency-cycle'

export async function getValue() {
  return Promise.all([
    directRead(),
    directExistence(),
    transitiveRead(),
    transitiveExistence(),
    nestedCacheRead(),
    nestedCacheExistence(),
    moduleLevel(),
    dependencyCycle(),
  ])
}
