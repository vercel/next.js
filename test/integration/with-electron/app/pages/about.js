import Link from 'next/link'

const About = () => (
  <div id="about-page">
    <p>This is the about page</p>
    <Link href="/">
      <a>Go Back</a>
    </Link>
  </div>
)

export default About
