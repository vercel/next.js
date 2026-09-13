'use client'

export function EnvDisplay() {
  return (
    <div id="nextPublicEmptyEnvVar">
      content: {`${process.env.NEXT_PUBLIC_EMPTY_ENV_VAR}`}
    </div>
  )
}
