function importTrailing(name) {
  return import(`#/${name}.js`)
}

function importMiddle(locale) {
  return import(`#/messages/${locale}/index.js`)
}

it('should resolve dynamic subpath imports with a trailing placeholder', async () => {
  expect((await importTrailing('a')).default).toBe('a')
  expect((await importTrailing('b')).default).toBe('b')
})

it('should resolve dynamic subpath imports with a middle placeholder', async () => {
  expect((await importMiddle('en')).default).toBe('hello')
  expect((await importMiddle('de')).default).toBe('hallo')
})
