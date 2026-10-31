import * as React from 'react'
import type { Route } from 'next'
import Form from 'next/form'

export default function Page() {
  const invalidRoutes = (
    <>
      <Form action="/wrong-link"></Form>
      <Form action="/blog/a?1/b"></Form>
      <Form action={`/blog/${'a/b/c'}`}></Form>
    </>
  )

  const validRoutes = (
    <>
      <Form action="/dashboard/another"></Form>
      <Form action="/about"></Form>
      <Form action="/redirect"></Form>
      <Form action={`/blog/${'a/b'}`}></Form>
      <Form action={'/invalid' as Route}></Form>
      <Form
        action={async (formData) => {
          'use server'
          console.log('function action', formData.get('myInput'))
        }}
      ></Form>
    </>
  )

  return (
    <>
      {invalidRoutes}
      {validRoutes}
    </>
  )
}
