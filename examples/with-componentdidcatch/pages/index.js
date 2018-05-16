export default () => {
  // componentDidCatch only catches client-side errors
  if (typeof window !== 'undefined') {
    throw new Error('Test')
  }
  return <div>server rendered</div>
}
