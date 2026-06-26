export default () => {
  if (typeof window !== 'undefined') {
    window.didHydrate = true
  }
  return 'oops thats a 404'
}
