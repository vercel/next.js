export function beforeNextInit() {
  // This is called before the Next.js app is initialized
  // and before the server is started
  console.log('beforeNextInit', require.resolve('react-dom/server'))
}
