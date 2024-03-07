import Image from 'next/image'

export default function Home() {
  return (
    <Image
      alt="red square"
      src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="
      width={64}
      height={64}
    />
  )
}
