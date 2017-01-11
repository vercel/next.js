export const SET_KITTENS = 'SET_KITTENS';
/**
 * Set the kittens(data response) from parameter to redux state.
 * @param kittens
 * @return {{type: string, kittens: Object}}
 */
export function setKittens(kittens: Object) {
  return {
    type: SET_KITTENS,
    kittens
  }
}