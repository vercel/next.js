import Image from 'next/image'

const Page = () => {
  return (
    <div>
      <main>
        <Image src="/test.jpg" width="400" height="400" alt="basic image" />
      </main>
    </div>
  )
}

export default Page

export const metadata = {
  title: 'Title',
  description: 'Description...',
  icons: {
    icon: '/test.jpg',
  },
}
