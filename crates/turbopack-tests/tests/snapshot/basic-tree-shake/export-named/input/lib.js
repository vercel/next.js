let dog = "dog";

dog += "!";

console.log(dog);

function getDog() {
  return dog;
}

dog += "!";

console.log(dog);

function setDog(newDog) {
  dog = newDog;
}

dog += "!";

console.log(dog);

export const dogRef = {
  initial: dog,
  get: getDog,
  set: setDog,
};

export let cat = "cat";

export const initialCat = cat;

export function getChimera() {
  return cat + dog;
}
