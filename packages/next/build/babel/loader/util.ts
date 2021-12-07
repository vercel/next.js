export function consumeIterator(iter: Iterator<any>) {
  while (true) {
    const { value, done } = iter.next()
    if (done) {
      return value
    }
  }
}
