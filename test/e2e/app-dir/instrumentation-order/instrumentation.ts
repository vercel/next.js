console.log('instrumentation:side-effect')

export async function register() {
  console.log('instrumentation:register:begin')
  await new Promise((resolve) => {
    setTimeout(() => {
      console.log('instrumentation:register:timeout')
      resolve(true)
    }, 300)
  })
  console.log('instrumentation:register:end')
}
