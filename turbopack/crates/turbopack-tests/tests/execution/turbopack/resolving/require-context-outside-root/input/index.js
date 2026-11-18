// A context directory that leaves the filesystem root must report an error at the
// call instead of failing the whole module. The value of this test is the `issues/`
// snapshot.

it('should report an issue for a context directory outside of the root', () => {
  expect(() =>
    require.context(
      '../../../../../../../../../../../../../../../../../../../../outside'
    )
  ).toThrow()
})
