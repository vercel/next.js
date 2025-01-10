export default () => (
  <div className="hello">
    <p>Hello World</p>
    <style jsx>{`
      .hello {
        font:
          15px Helvetica,
          Arial,
          sans-serif;
        background: #eee;
        padding: 100px;
        text-align: center;
        transition: 100ms ease-in background;
        lost-column: 1/3;
        &:hover {
          color: red;
        }
      }
      .hello:hover {
        background: #ccc;
      }
    `}</style>
  </div>
)
