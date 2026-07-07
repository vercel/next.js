import Image from 'next/image'
import LegacyImage from 'next/legacy/image'
import profilePic from '../../public/small.jpg'

function About() {
  return (
    <>
      <h1>My Homepage</h1>
      <LegacyImage src={profilePic} alt="Picture of the author" />
      <Image src={profilePic} alt="Picture of the author" />
      <p>Welcome to my homepage!</p>
    </>
  )
}

export default About
