export async function sendOTP(phoneNumber: string) {
  const resp = await fetch('/api/send_otp', {
    method: 'POST',
    body: JSON.stringify({
      intlCode: '+1',
      phoneNumber,
    }),
  })
  const data = await resp.json()
  return data.methodId
}
