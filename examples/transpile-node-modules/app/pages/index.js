import Logo from 'component-a'

export default () => (
  <div>
    <Logo />
    <style jsx>{`
      div {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        left: 0;
      }

      div:hover {
        top: 2em;
        right: 2em;
        bottom: 2em;
        left: 2em;
        box-shadow: 0 2px 30px black;
      }
    `}</style>
  </div>
)
