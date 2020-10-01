export type ErrorMsg = {
  title: string
  message: string
}

export interface ErrorGetProps {
  res: {
    statusCode: string
  }
  err: {
    statusCode: number
  }
}
