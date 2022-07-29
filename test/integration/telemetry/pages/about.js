import Image from 'next/image'
import { Image as FutureImage } from 'next/future/image'
import profilePic from '../public/small.jpg'

function About() {
  return (
    <>
      <h1>My Homepage</h1>
      <Image src={profilePic} alt="Picture of the author" />
      <p>Welcome to my homepage!</p>
    </>
  )
}

export default About

export function AboutFutureImage() {
  return <FutureImage src={profilePic} alt="Picture of the author" />
}
