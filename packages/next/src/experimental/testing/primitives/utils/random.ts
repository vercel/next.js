const RealDate = Date

function random(seed: number) {
  const x = Math.sin(seed++) * 10000
  return x - Math.floor(x)
}

export function shuffle<T>(array: T[], seed: number = RealDate.now()): T[] {
  let length = array.length

  while (length) {
    const index = Math.floor(random(seed) * length--)

    const previous = array[length]
    array[length] = array[index]
    array[index] = previous
    ++seed
  }

  return array
}
