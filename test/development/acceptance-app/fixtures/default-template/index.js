export default () => {
  if (typeof window !== 'undefined') {
    throw new Error('test')
  }

  return null
}
