import Link from 'next/link'

const About = () => {
  return (
    <div>
      <Link href="/no-observer">
        <a id="link-no-observer">Test No IntersectionObserver</a>
      </Link>
    </div>
  )
}

export default About
