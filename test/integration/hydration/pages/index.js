export default () => {
  if (typeof window !== 'undefined') {
    window.didHydrate = true
  }
  return 'index'
}
