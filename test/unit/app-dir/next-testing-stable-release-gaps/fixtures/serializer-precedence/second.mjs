export default {
  test: (value) => value?.releaseValue === 1,
  serialize: () => 'SECOND_SERIALIZER',
}
