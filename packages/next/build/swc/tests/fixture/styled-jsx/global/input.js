const Test = () => (
  <div>
    <style jsx global>{`
      body {
        color: red
      }

      :hover { color: red; display: flex;
        animation: foo 1s ease-out }

      div a {
        display: none;
      }

      [data-test] > div {
        color: red;
      }
    `}</style>
  </div>
)

const Test2 = () => <style global jsx>{'p { color: red }'}</style>
