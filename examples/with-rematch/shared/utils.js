// Robust way to check if it's Node or browser
export const checkServer = () => {
  return (typeof window === 'undefined')
}
