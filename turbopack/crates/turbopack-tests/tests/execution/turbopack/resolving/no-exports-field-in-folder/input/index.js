import folder1 from './folder1'
it('should not apply the exports field in a folder', () => {
  expect(folder1).toBe('index')
  expect(require('./folder1')).toHaveProperty('default', 'index')
})

import folder2 from './folder2'
it('should not apply the exports field in a folder but the main field', () => {
  expect(folder2).toBe('main')
  expect(require('./folder2')).toHaveProperty('default', 'main')
})
