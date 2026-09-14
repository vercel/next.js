import Image from 'next/image'

import profilePic from '../public/small.jpg'

export const runtime = 'experimental-edge'

function About() {
  return (
    <>
      <h1>edge</h1>
      <Image src={profilePic} alt="Picture of the author in edge runtime" />
    </>
  )
}

export default About
