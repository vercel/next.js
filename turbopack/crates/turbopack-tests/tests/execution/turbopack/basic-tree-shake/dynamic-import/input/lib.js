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
