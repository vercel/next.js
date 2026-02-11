const data: { id: string; name: string }[] = []
for (let i = 0; i < 1000; i++) {
  data.push({ id: `id-${i}`, name: `name-${i}` })
}

export function testData() {
  return data
}
