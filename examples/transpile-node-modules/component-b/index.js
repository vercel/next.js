export default () => (
  <span>
    <style jsx>{`
       span::before {
        content: "▲";
        display: inline-block;
        width: 1em;
        height: 1em;
        color: inherit;
        font-size: inherit;
        font-family: sans-serif;
        line-height: 0;
      }
    `}</style>
  </span>
)
