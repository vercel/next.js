let dog = 'dog'

dog += '!'
;(globalThis.dogLogs ??= []).push(dog)

function getDog() {
  return dog
}

dog += '!'
;(globalThis.dogLogs ??= []).push(dog)

function setDog(newDog) {
  dog = newDog
}

dog += '!'
;(globalThis.dogLogs ??= []).push(dog)

export const dogRef = {
  initial: dog,
  get: getDog,
  set: setDog,
}

export let cat = 'cat'

export const initialCat = cat

export function getChimera() {
  return cat + dog
}

it('keeps the side effects of the entry module', () => {
  // The order of the side effects relative to the `dog += '!'` updates is
  // currently not preserved with module fragments, see the
  // `__skipped__/side-effect-order` test.
  expect(globalThis.dogLogs).toHaveLength(3)
})

it('keeps all exports of the entry module working', () => {
  expect(cat).toBe('cat')
  expect(initialCat).toBe('cat')
  expect(dogRef.initial).toBe('dog!!!')
  expect(getChimera()).toBe('catdog!!!')
  dogRef.set('wolf')
  expect(dogRef.get()).toBe('wolf')
  expect(getChimera()).toBe('catwolf')
})
