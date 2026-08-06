export default class DefaultClass {
  static default() {
    return 'defaultClass'
  }
}

export function setDefaultClass(c) {
  DefaultClass = c
}
