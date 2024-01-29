import Image from 'next/image'

export async function middleware(request) {
  // reference Image so it's not tree shaken / DCE
  console.log(`Has image: ${Boolean(Image)}`)
}
