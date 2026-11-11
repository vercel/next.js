export default {
  test: (value) => value?.releaseSpecial === 42,
  serialize: () => 'RELEASE_SPECIAL',
}
