import baseTheme from '../../base.module.css'
import theme from './footer.module.css'

export default function Footer() {
  return (
    <footer className={theme.footer}>
      <div className={baseTheme.container}>
        <small>
          &copy;{new Date().getFullYear()}
          <a
            target="_blank"
            href="https://www.takeshape.io"
            rel="noopener noreferrer"
          >
            {' '}
            TakeShape Inc.
          </a>
        </small>
      </div>
    </footer>
  )
}
