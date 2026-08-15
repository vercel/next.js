// A glob that matches a file without a module type must report an error that
// says which glob pulled the file in. The value of this test is the `issues/`
// snapshot.

const texts = import.meta.glob('./content/*.txt')

it('should have reported an issue naming the glob that matched the file', () => {
  expect(Object.keys(texts)).toEqual(['./content/gamma.txt'])
})
