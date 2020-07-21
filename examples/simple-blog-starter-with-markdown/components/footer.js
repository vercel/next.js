import Container from './container'

export default function Footer() {
  const date = new Date()
  return (
    <footer>
      <Container>
        <div className="mt-28 flex flex-col lg:flex-row items-center">
          <p className="tracking-tighter opacity-50 leading-tight text-center lg:text-left mb-10 lg:mb-0 lg:pr-4 lg:w-1/2">
            © {date.getFullYear()} Statically Generated with Next.js.
          </p>
        </div>
      </Container>
    </footer>
  )
}
