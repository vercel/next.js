export type ErrorResponse = {
  title: string
  content: string
}

export function isErrorResponse(
  error: ErrorResponse | string | undefined
): error is ErrorResponse {
  return (error as ErrorResponse)?.title !== undefined
}
