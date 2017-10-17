// We need to use `require` instead of `import`
// They also must be assigned to a variable/constant
const logoSVG = require('../static/images/logo.svg')
const logoPNG = require('../static/images/logo.png')
const txt = require('../static/file.txt')

export default () => (
  <div>
    <strong>{txt}</strong>
    <br />
    <img src={logoSVG} alt='Logo SVG' width='305' />
    <br />
    <strong>{logoSVG}</strong>
    <br />
    <img src={logoPNG} alt='Logo PNG' width='305' />
    <br />
    <strong>{logoPNG}</strong>
  </div>
)
