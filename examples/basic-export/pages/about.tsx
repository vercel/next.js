import Link from 'next/link'

const About = () => {
  return (
    <div>
      <h1>About</h1>
      <p>Hello World! This is the About page</p>
      <p>
        Visit the <Link href="/">Home</Link> page.
      </p>
    </div>
  )
}

export default About
