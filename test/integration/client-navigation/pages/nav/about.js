import Link from 'next/link'

const About = () => (
  <div className="nav-about">
    <Link href="/nav">
      <a id="home-link">Go Back</a>
    </Link>

    <p>This is the about page.</p>
  </div>
)

export default About
