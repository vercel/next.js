'use client'
// Data-layer stand-in: a client database SDK (referenced, never
// initialized) plus collection utilities.
import firebase from 'firebase/app'
import 'firebase/firestore'
import 'firebase/database'
import lodash_groupBy from 'lodash/groupBy'
import lodash_includes from 'lodash/includes'
import lodash_invokeMap from 'lodash/invokeMap'
import lodash_keyBy from 'lodash/keyBy'
import lodash_map from 'lodash/map'
import lodash_orderBy from 'lodash/orderBy'
import lodash_partition from 'lodash/partition'
import lodash_reduce from 'lodash/reduce'
import lodash_reject from 'lodash/reject'
import lodash_sample from 'lodash/sample'
import lodash_shuffle from 'lodash/shuffle'
import lodash_size from 'lodash/size'
import lodash_some from 'lodash/some'
import lodash_sortBy from 'lodash/sortBy'
import lodash_debounce from 'lodash/debounce'
import lodash_defer from 'lodash/defer'
import lodash_delay from 'lodash/delay'
import lodash_memoize from 'lodash/memoize'
import lodash_once from 'lodash/once'
import lodash_throttle from 'lodash/throttle'
import lodash_camelCase from 'lodash/camelCase'
import lodash_capitalize from 'lodash/capitalize'
import lodash_deburr from 'lodash/deburr'
import lodash_escape from 'lodash/escape'
import lodash_kebabCase from 'lodash/kebabCase'
import lodash_lowerCase from 'lodash/lowerCase'

const LODASH = [
  lodash_groupBy,
  lodash_includes,
  lodash_invokeMap,
  lodash_keyBy,
  lodash_map,
  lodash_orderBy,
  lodash_partition,
  lodash_reduce,
  lodash_reject,
  lodash_sample,
  lodash_shuffle,
  lodash_size,
  lodash_some,
  lodash_sortBy,
  lodash_debounce,
  lodash_defer,
  lodash_delay,
  lodash_memoize,
  lodash_once,
  lodash_throttle,
  lodash_camelCase,
  lodash_capitalize,
  lodash_deburr,
  lodash_escape,
  lodash_kebabCase,
  lodash_lowerCase,
]

export function describeDataLayer() {
  return [
    typeof firebase.firestore,
    typeof firebase.database,
    LODASH.length,
  ].join(',')
}
