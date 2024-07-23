'use client'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { ComponentProps } from 'react'
import { useActionState } from 'react'

export function NavigateButton({
  to,
  ...props
}: { to: string } & ComponentProps<'button'>) {
  const router = useRouter()
  const [, dispatch] = useActionState(() => router.push(to), undefined)
  return <button type="submit" formAction={dispatch} {...props} />
}
