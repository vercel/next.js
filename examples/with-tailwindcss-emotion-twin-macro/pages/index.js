import Button from '../components/Button'

export default function Index() {
  return (
    <main tw="max-w-2xl mx-auto px-4 min-h-[100vh] flex flex-col justify-center items-center">
      <h1 tw="mb-2 md:mb-4 text-2xl md:text-3xl font-bold">
        Tailwind CSS with Emotion.js
      </h1>
      <p>
        This example uses <code>twin.macro</code> and{' '}
        <code>babel-plugin-twin</code>.<br />
      </p>
      <p tw="flex flex-wrap items-center justify-center gap-2 mt-8">
        <Button>Just a Button</Button>
        <Button variant="hollow">Hollow Button</Button>
      </p>
    </main>
  )
}
