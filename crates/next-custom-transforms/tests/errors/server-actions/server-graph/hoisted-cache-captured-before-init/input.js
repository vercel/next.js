export function CacheBeforeCapturedInit({ name }) {
  const greet = formatGreeting
  const greeting = `Hello, ${name}!`
  return greet

  async function formatGreeting() {
    'use cache'

    return greeting
  }
}
