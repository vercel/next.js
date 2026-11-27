import styles from './branching.module.css'

const COUNT = 40

// The class names `name` expands to, without the generated prefix.
function classes(name) {
  expect(typeof styles[name]).toBe('string')
  return styles[name].split(' ').map((className) => {
    const match = /_(c\d+)$/.exec(className)
    expect(match).not.toBeNull()
    return match[1]
  })
}

it('expands branching composes cycles once per class, in pre-order', () => {
  for (let i = 0; i < COUNT; i++) {
    // Following the first composed class first visits every class in order, wrapping around.
    const expected = Array.from(
      { length: COUNT },
      (_, offset) => `c${(i + offset) % COUNT}`
    )
    expect(classes(`c${i}`)).toEqual(expected)
  }
})
