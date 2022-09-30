export default () => (
  <div>
    <p>test</p>
    <style jsx>{`
      .container :global(> *) {
        color: red;
      }
    `}</style>
  </div>
)