export default () => (
  <div className='hey'>
    <p>Hey!</p>
    <style jsx>{`
      .hey {
        font: 15px Helvetica, Arial, sans-serif;
        background: #eee;
        padding: 100px;
        text-align: center;
        transition: 100ms ease-in background;
      }
      .hey:hover {
        background: #ccc;
      }
    `}</style>
  </div>
)
