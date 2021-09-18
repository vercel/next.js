// We allow some additional attached properties for Errors
interface NextError extends Error {
  type?: string
  page?: string
  code?: string | number
  cancelled?: boolean
}

export default function isError(err: unknown): err is NextError {
  return (
    typeof err === 'object' && err !== null && 'name' in err && 'message' in err
  )
}
