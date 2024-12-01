async function a() {
  'use cache'
  // this is not allowed here
  this.foo()
  // arguments is not allowed here
  console.log(arguments)

  const b = async () => {
    // this is not allowed here
    this.foo()
    // arguments is not allowed here
    console.log(arguments)
  }

  function c() {
    // this is allowed here
    this.foo()
    // arguments is allowed here
    console.log(arguments)

    const d = () => {
      // this is allowed here
      this.foo()
      // arguments is allowed here
      console.log(arguments)
    }

    const e = async () => {
      'use server'
      // this is not allowed here
      this.foo()
      // arguments is not allowed here
      console.log(arguments)
    }
  }
}

export const api = {
  result: null,
  product: {
    async fetch() {
      'use cache'

      // this is not allowed here
      this.result = await fetch('https://example.com').then((res) => res.json())
      // arguments is not allowed here
      console.log(arguments)
    },
  },
}
