export default function passEnv() {
  let passEnv: { [x: string]: string | undefined } | undefined
  if (process.env.__NEXT_ENV_PASS) process.env.__NEXT_ENV_PASS.split(',').forEach((key) => {
    passEnv ? passEnv[key] = process.env[key] : passEnv = {[key]: process.env[key]}
  })

  return passEnv
}
