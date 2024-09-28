'use client'

function Page(props: any) {
  console.log(props.params.foo)
  if (typeof window === 'undefined') {
    console.log(props.params.bar)
  }
}

export default Page
