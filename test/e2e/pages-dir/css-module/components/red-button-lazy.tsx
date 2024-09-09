import { useLoadOnClientSide } from './useLoadOnClientSide'
const loader = () => import('./red-button').then(({ RedButton }) => RedButton)

export function RedButtonLazy() {
  const RedButton = useLoadOnClientSide(loader, null)
  return RedButton && <RedButton />
}
