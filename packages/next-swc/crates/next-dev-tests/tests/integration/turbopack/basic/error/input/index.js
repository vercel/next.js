it('should throw a good error when parsing file fails', async () => {
  await expect(import('./broken')).rejects.toMatchObject({
    message:
      "Could not parse module '[project]/packages/next-swc/crates/next-dev-tests/tests/temp/turbopack/basic/error/input/broken.js'",
  })
})
