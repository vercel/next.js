import cssModuleStyles from './page.module.css'
import scssModuleStyles from './page.module.scss'

export default function Page() {
  return (
    <div>
      <h1>CSS URL Deployment ID Test</h1>
      <div className={cssModuleStyles.moduleWithImage}>CSS Module</div>
      <div className={scssModuleStyles.scssWithImage}>SCSS Module</div>
      <div className="global-with-image">Global CSS</div>
    </div>
  )
}
