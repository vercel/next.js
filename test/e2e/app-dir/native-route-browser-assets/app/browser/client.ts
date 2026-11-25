import './styles.css'
import { message } from './shared'

document.querySelector('#message')!.textContent = message

document.querySelector('#lazy')!.addEventListener('click', async () => {
  const { lazy } = await import('./lazy')
  document.querySelector('#lazy-result')!.textContent = lazy
})
