
export default () => (
  <div className='hello'>
    <h1 className='hello-world-heading'>Hello World, I am being styled using CSS Modules!</h1>
    <p className='howToCSS'>Using a custom stylesheet is as simple as you would with normal HTML and CSS.
      You add a next.config.js file to the root directory and add the following code to it: <br />
    </p>
    <p className='codeSection'>
      const withCSS = require('@zeit/next-css')<br />
      module.exports = withCSS()
    </p>
  </div>
)
