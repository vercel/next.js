'use client'
import { useRouter } from 'next/navigation'
import { revalidateAction } from './action'

export default function Page() {
  const router = useRouter()

  const handleRevalidateSubmit = async () => {
    const result = await revalidateAction()
    if (result.success) {
      close()
    }
  }

  const close = () => {
    router.back()
  }

  return (
    <div className="z-10 fixed w-96 p-5 top-20 left-0 right-0 m-auto rounded shadow-2xl bg-gray-50 border-2">
      <div className="flex justify-between">
        <h2 id="modal">Modal</h2>
        <button
          type="button"
          id="modal-close-button"
          onClick={() => close()}
          className="bg-gray-100 border p-2 rounded"
        >
          close
        </button>
      </div>
      <form action={handleRevalidateSubmit}>
        <button
          type="submit"
          className="bg-sky-600 text-white p-2 rounded"
          id="modal-submit-button"
        >
          Revalidate Submit
        </button>
      </form>
    </div>
  )
}
