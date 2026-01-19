export const api = {
  product: {
    async fetch() {
      'use cache'

      return fetch('https://example.com').then((res) => res.json())
    },
  },
}
