export default (props) => (
  <main>
    {props.children}
    <style jsx global>{`
      * {
        font-family: Menlo, Monaco, "Lucida Console", "Liberation Mono", "DejaVu Sans Mono", "Bitstream Vera Sans Mono", "Courier New", monospace, serif;
      }
      body {
        margin: 0;
        padding: 25px 50px;
      }
      a {
        color: #22BAD9;
      }
      p {
        font-size: 14px;
        line-height: 24px;
      }
      article {
        margin: 0 auto;
        max-width: 650px;
      }
      button {
        padding: 5px 7px;
        background-color: #22BAD9;
        border: 0;
        color: white;
      }
      button:focus {
        outline: none;
      }
    `}</style>
  </main>
)
