export function consumeIterator(iter) {
  while (true) {
    const { value, done } = iter.next()
    if (done) {
      return value
    }
  }
}
