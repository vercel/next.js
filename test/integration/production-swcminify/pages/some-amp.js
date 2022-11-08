import { useAmp } from 'next/amp'

if (typeof window !== 'undefined') {
  window.addEventListener('error', () => {
    document.querySelector('p').innerText('error')
  })
}

export const config = { amp: 'hybrid' }

export default () => <p>{useAmp() ? 'AMP' : 'Not AMP'}</p>
