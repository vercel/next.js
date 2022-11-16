import capitalize from '@hashicorp/platform-util/text/capitalize'

it('should work', () => {
  expect(capitalize('test')).toEqual('Test')
})
