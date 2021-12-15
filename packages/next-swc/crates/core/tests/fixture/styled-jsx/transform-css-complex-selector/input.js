export default () => (
  <div>
    <p>test</p>
    <style jsx>{`
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
    `}</style>
  </div>
)