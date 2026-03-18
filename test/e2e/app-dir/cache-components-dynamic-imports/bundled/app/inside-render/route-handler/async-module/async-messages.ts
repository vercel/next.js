console.log('[inside-component] async-messages :: imported, sleeping')
await new Promise<void>((resolve) => setTimeout(resolve, 500))
console.log('[inside-component] async-messages :: ready')
export default { title: 'hello' }
