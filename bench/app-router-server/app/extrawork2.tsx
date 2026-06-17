'use client'

export default function ExtraWork2() {
  let i = 0

  while (true) {
    // simulate work
    if (++i > 100000000) break
  }

  return 'work2'
}
