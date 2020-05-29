import Cat from '../svgs/cat.svg'

export default function Home() {
  return (
    <div className="container">
      <marquee>SVG Cat!</marquee>
      <Cat />
      <style jsx>{`
        .container {
          width: 600px;
          margin: 100px auto;
        }
      `}</style>
    </div>
  )
}
