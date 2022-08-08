export default () => (
  <div>
    <p>test</p>
    <style jsx>{`
      html {
        background-image:
          linear-gradient(0deg, rgba(255, 255, 255, 0.8), rgba(255, 255, 255, 0.8)),
          url(/static/background.svg);
      }
      
      :global(p) {
        color: blue
      }
      
      :global(p){
        color: blue;
      }
      
      :global(p), a {
        color: blue;
      }
      
      :global(.foo + a) {
        color: red;
      }
      
      :global(body) {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      }
      
      p {
        color: red;
      }
      
      p{
        color: red
      }
      
      * {
        color: blue;
      }
      
      [href="woot"] {
        color: red;
      }
      
      p a span {
        color: red;
      }
      
      p :global(span) {
        background: blue
      }
      
      p a[title="'w ' '  t'"] {
        margin: auto
      }
      
      p :global(span:not(.test)) {
        color: green
      }
      
      p, h1 {
        color: blue;
        animation: hahaha 3s ease forwards infinite;
        animation-name: hahaha;
        animation-delay: 100ms;
      }
      
      p {
        animation: hahaha 1s, hehehe 2s;
      }
      
      p:hover {
        color: red;
      }
      
      p::before {
        color: red;
      }
      
      :hover {
        color: red;
      }
      
      ::before {
        color: red;
      }
      
      :hover p {
        color: red;
      }
      
      p + a {
        color: red;
      }
      
      p ~ a {
        color: red;
      }
      
      p > a {
        color: red;
      }
      
      @keyframes hahaha {
        from { top: 0 }
        to { top: 100 }
      }
      
      @keyframes hehehe {
        from { left: 0 }
        to { left: 100 }
      }
      
      @media (min-width: 500px) {
        .test {
          color: red;
        }
      }
      
      .test {
        /* test, test */
        display: block;
        /*
      
        test
        */
      }
      
      .inline-flex {
        display: inline-flex;
      }
      
      .flex {
        display: flex;
      }
      
      .test {
        box-shadow: 0 0 10px black, inset 0 0 5px black
      }
      
      .test[title=","] {
        display: inline-block;
      }
      
      .test.is-status .test {
        color: red;
      }
      
      .a-selector:hover,
      .a-selector:focus
      {
        outline: none;
      }
      
      @media (min-width: 1px) and (max-width: 768px) {
        [class*='grid__col--'] {
          margin-top: 12px;
          margin-bottom: 12px;
        }
      }
      
      @media (max-width: 64em) {
        .test {
          margin-bottom: 1em;
        }
        @supports (-moz-appearance: none) and (display: contents) {
          .test {
            margin-bottom: 2rem;
          }
        }
      }      
    `}</style>
  </div>
)