import Link from 'next/link'

const About = () => (
  <div>
    <p>This is the about page.</p>
    <div>
      <Link href="/">Go Back</Link>
    </div>
    <img width={200} src="/static/vercel.png" />
  </div>
)

export default About
