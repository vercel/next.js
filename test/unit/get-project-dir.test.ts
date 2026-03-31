describe('get-project-dir', () => {
  it('should not start dev server on require', async () => {
    require('next/dist/lib/get-project-dir')
  })
})
