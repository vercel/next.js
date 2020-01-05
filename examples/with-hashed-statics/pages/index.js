import logoSVG from '../assets/images/logo.svg'
import logoPNG from '../assets/images/logo.png'
import txt from '../assets/file.txt'

export default () => (
  <div>
    <strong>{txt}</strong>
    <br />
    <img src={logoSVG} alt="Logo SVG" width="305" />
    <br />
    <strong>{logoSVG}</strong>
    <br />
    <img src={logoPNG} alt="Logo PNG" width="305" />
    <br />
    <strong>{logoPNG}</strong>
  </div>
)
