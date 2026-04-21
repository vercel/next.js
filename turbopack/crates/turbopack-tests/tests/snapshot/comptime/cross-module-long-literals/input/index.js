import { LONG_STRING, LONG_NUMBER, LONG_BIG_NUMBER, REGEX } from './other'

// shouldn't inline
console.log(LONG_STRING, LONG_NUMBER, LONG_BIG_NUMBER, REGEX)

// TODO ideally would still use for evaluation even though not inlined
if (LONG_STRING && LONG_NUMBER && LONG_BIG_NUMBER && REGEX) {
  console.log('ok')
} else {
  require('./dead-code')
}
