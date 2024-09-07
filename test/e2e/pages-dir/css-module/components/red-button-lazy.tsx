import { useLoadOnClientSide } from './useLoadOnClientSide'
const loader = () => import('./red-button').then(({ RedButton }) => RedButton)

export const RedButtonLazy = () => {
  const RedButton = useLoadOnClientSide(loader, null)
  return RedButton && <RedButton />
}
