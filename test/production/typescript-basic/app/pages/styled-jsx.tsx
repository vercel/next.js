import css from 'styled-jsx/css'

const divStyles = css`
  div {
    color: orange;
  }
`

export default function Page(props) {
  return (
    <>
      <div>styled-jsx support (should be orange)</div>
      <p>styled p tag (should be pink)</p>
      <style jsx>{divStyles}</style>
      <style jsx>{`
        p {
          color: pink;
        }
      `}</style>
      <style jsx global>{`
        body {
          background: #000;
        }
      `}</style>
    </>
  )
}
