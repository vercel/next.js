'use client'
// Real heavy dependencies from the repository standing in for the shared
// vendor layer a production app ships to the client. Per-method lodash
// imports keep the module graph fine-grained, like real utility usage.
import lodash_chunk from 'lodash/chunk'
import lodash_compact from 'lodash/compact'
import lodash_concat from 'lodash/concat'
import lodash_difference from 'lodash/difference'
import lodash_drop from 'lodash/drop'
import lodash_fill from 'lodash/fill'
import lodash_findIndex from 'lodash/findIndex'
import lodash_flatten from 'lodash/flatten'
import lodash_flattenDeep from 'lodash/flattenDeep'
import lodash_fromPairs from 'lodash/fromPairs'
import lodash_head from 'lodash/head'
import lodash_indexOf from 'lodash/indexOf'
import lodash_intersection from 'lodash/intersection'
import lodash_join from 'lodash/join'
import lodash_last from 'lodash/last'
import lodash_nth from 'lodash/nth'
import lodash_pull from 'lodash/pull'
import lodash_reverse from 'lodash/reverse'
import lodash_slice from 'lodash/slice'
import lodash_sortedIndex from 'lodash/sortedIndex'
import lodash_tail from 'lodash/tail'
import lodash_take from 'lodash/take'
import lodash_union from 'lodash/union'
import lodash_uniq from 'lodash/uniq'
import lodash_unzip from 'lodash/unzip'
import lodash_without from 'lodash/without'
import lodash_xor from 'lodash/xor'
import lodash_zip from 'lodash/zip'
import lodash_countBy from 'lodash/countBy'
import lodash_every from 'lodash/every'
import lodash_filter from 'lodash/filter'
import lodash_find from 'lodash/find'
import lodash_flatMap from 'lodash/flatMap'
import lodash_forEach from 'lodash/forEach'

const LODASH = [
  lodash_chunk,
  lodash_compact,
  lodash_concat,
  lodash_difference,
  lodash_drop,
  lodash_fill,
  lodash_findIndex,
  lodash_flatten,
  lodash_flattenDeep,
  lodash_fromPairs,
  lodash_head,
  lodash_indexOf,
  lodash_intersection,
  lodash_join,
  lodash_last,
  lodash_nth,
  lodash_pull,
  lodash_reverse,
  lodash_slice,
  lodash_sortedIndex,
  lodash_tail,
  lodash_take,
  lodash_union,
  lodash_uniq,
  lodash_unzip,
  lodash_without,
  lodash_xor,
  lodash_zip,
  lodash_countBy,
  lodash_every,
  lodash_filter,
  lodash_find,
  lodash_flatMap,
  lodash_forEach,
]

export function describeUtils() {
  return LODASH.length
}
