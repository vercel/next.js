'use client'
// Content-fixture layer: string and collection utilities.
import lodash_has from 'lodash/has'
import lodash_invert from 'lodash/invert'
import lodash_keys from 'lodash/keys'
import lodash_mapKeys from 'lodash/mapKeys'
import lodash_mapValues from 'lodash/mapValues'
import lodash_toPairs from 'lodash/toPairs'
import lodash_transform from 'lodash/transform'
import lodash_unset from 'lodash/unset'
import lodash_update from 'lodash/update'
import lodash_values from 'lodash/values'
import lodash_add from 'lodash/add'
import lodash_ceil from 'lodash/ceil'
import lodash_divide from 'lodash/divide'
import lodash_floor from 'lodash/floor'
import lodash_max from 'lodash/max'
import lodash_mean from 'lodash/mean'
import lodash_min from 'lodash/min'
import lodash_multiply from 'lodash/multiply'
import lodash_round from 'lodash/round'
import lodash_subtract from 'lodash/subtract'
import lodash_sum from 'lodash/sum'
import lodash_clamp from 'lodash/clamp'
import lodash_inRange from 'lodash/inRange'
import lodash_random from 'lodash/random'

const LODASH = [
  lodash_has,
  lodash_invert,
  lodash_keys,
  lodash_mapKeys,
  lodash_mapValues,
  lodash_toPairs,
  lodash_transform,
  lodash_unset,
  lodash_update,
  lodash_values,
  lodash_add,
  lodash_ceil,
  lodash_divide,
  lodash_floor,
  lodash_max,
  lodash_mean,
  lodash_min,
  lodash_multiply,
  lodash_round,
  lodash_subtract,
  lodash_sum,
  lodash_clamp,
  lodash_inRange,
  lodash_random,
]

export function fixtureName(seed) {
  return 'fixture-' + (seed % LODASH.length)
}
