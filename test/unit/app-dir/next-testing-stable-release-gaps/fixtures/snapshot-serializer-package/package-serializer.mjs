export default {
  test: (value) => value?.releaseSpecial === 42,
  serialize: () => 'PACKAGE_SERIALIZER',
}
