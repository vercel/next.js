import { registerOTel } from '@vercel/otel'

export const onRequestError = async (err, request, context) => {
  await fetch(`http://localhost:${process.env.PORT}/write-log`, {
    method: 'POST',
    body: JSON.stringify({
      message: err.message,
      request,
      context,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

export function register() {
  registerOTel({
    serviceName: 'test',
  })
}
