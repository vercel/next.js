export default function Home({ fontFamily }) {
  return (
    <div>
      <style jsx global>
        {`
          body {
            font-family: ${fontFamily};
          }
          code:before,
          code:after {
            content: '\`';
          }
        `}
      </style>
    </div>
  )
}