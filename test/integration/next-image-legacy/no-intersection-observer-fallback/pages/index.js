import Link from 'next/link'

const About = () => {
  return (
    <div>
      <Link href="/no-observer" id="link-no-observer">
        Test No IntersectionObserver
      </Link>
    </div>
  )
}

export default About
