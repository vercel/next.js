'use client'
// Auth/storage-layer stand-in.
import firebase from 'firebase/app'
import 'firebase/auth'
import 'firebase/storage'
import lodash_pad from 'lodash/pad'
import lodash_repeat from 'lodash/repeat'
import lodash_snakeCase from 'lodash/snakeCase'
import lodash_split from 'lodash/split'
import lodash_startCase from 'lodash/startCase'
import lodash_template from 'lodash/template'
import lodash_trim from 'lodash/trim'
import lodash_truncate from 'lodash/truncate'
import lodash_unescape from 'lodash/unescape'
import lodash_upperFirst from 'lodash/upperFirst'
import lodash_words from 'lodash/words'
import lodash_clone from 'lodash/clone'
import lodash_cloneDeep from 'lodash/cloneDeep'
import lodash_isEqual from 'lodash/isEqual'
import lodash_isEmpty from 'lodash/isEmpty'
import lodash_merge from 'lodash/merge'
import lodash_omit from 'lodash/omit'
import lodash_pick from 'lodash/pick'
import lodash_set from 'lodash/set'
import lodash_get from 'lodash/get'

const LODASH = [
  lodash_pad,
  lodash_repeat,
  lodash_snakeCase,
  lodash_split,
  lodash_startCase,
  lodash_template,
  lodash_trim,
  lodash_truncate,
  lodash_unescape,
  lodash_upperFirst,
  lodash_words,
  lodash_clone,
  lodash_cloneDeep,
  lodash_isEqual,
  lodash_isEmpty,
  lodash_merge,
  lodash_omit,
  lodash_pick,
  lodash_set,
  lodash_get,
]

export function describeAuthLayer() {
  return [typeof firebase.auth, typeof firebase.storage, LODASH.length].join(
    ','
  )
}
