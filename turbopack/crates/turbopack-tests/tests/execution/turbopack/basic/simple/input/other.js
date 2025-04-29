import anotherImported, {
  anotherNamed as anotherNamedImported,
} from './another'

let other = 789
console.log('2 other', other, anotherImported, anotherNamedImported)

export default other
