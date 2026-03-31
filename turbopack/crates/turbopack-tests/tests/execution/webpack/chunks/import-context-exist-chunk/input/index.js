it('should resolve when import existed chunk (#8626)', function (done) {
  require.context('./dir-initial/')
  const fileName = 'initialModule'
  import(`./dir-initial/${fileName}`)
    .then(({ default: m }) => {
      expect(m).toBe('initialModuleDefault')
      done()
    })
    .catch(done)
})

it('should resolve when import existed chunk with fake maps', function (done) {
  require.context('./dir-initial-with-fake-map/')
  const fileName = 'initialModule'
  import(`./dir-initial-with-fake-map/${fileName}`)
    .then(({ default: m }) => {
      expect(m).toBe('initialModuleDefault')
      done()
    })
    .catch(done)
})
