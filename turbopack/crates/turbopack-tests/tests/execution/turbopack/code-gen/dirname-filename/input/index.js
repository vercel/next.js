it('__dirname and __filename should be set', () => {
  expect(__dirname).toMatch(/^\[project\]\/.*\/code-gen\/dirname-filename\/input\/index\.js \[test\] \(ecmascript\)$/)
  expect(__filename).toMatch(/dirname-filename\/output\/.*.js$/);
})
