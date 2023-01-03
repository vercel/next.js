export const shouldDelay = () =>
  new URLSearchParams(window.location.search).get('pause_hydration') != null

export const delayHydration = async () => {
  const btn = document.createElement('button')

  btn.setAttribute('id', '__next-pause-hydration')
  btn.style.position = 'fixed'
  btn.style.bottom = '10px'
  btn.style.left = '10px'
  btn.textContent = 'Hydrate'

  document.body.append(btn)

  return new Promise<void>((resolve) => {
    console.warn('Hydration is paused.')

    btn.addEventListener('click', () => {
      document.body.removeChild(btn)
      console.warn('Hydration is resumed.')
      resolve()
    })
  })
}
