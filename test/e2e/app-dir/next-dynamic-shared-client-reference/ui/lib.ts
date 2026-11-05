const items = ['apple', 'banana', 'cherry']

export function search(query: string): string {
  return items.find((item) => item === query) ?? 'not found'
}
