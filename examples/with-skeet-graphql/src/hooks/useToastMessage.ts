import { Toast, toastsState } from '@/store/toasts'
import { useRecoilState } from 'recoil'
import { useCallback } from 'react'

type ToastMessage = {
  title: string
  description: string
  type: 'success' | 'error' | 'warning' | 'info'
}

export default function useToastMessage() {
  const [toasts, setToasts] = useRecoilState(toastsState)

  const addToast = useCallback(
    (toastMessage: ToastMessage) => {
      const toast: Toast = {
        ...toastMessage,
        createdAt: Date.now(),
      }
      setToasts([...toasts, toast])
    },
    [toasts, setToasts]
  )
  return addToast
}
