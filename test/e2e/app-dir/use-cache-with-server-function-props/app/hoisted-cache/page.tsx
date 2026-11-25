import { GreetingForm } from './greeting-form'

export default function Page() {
  return <Greeting name="Ada" />
}

function Greeting({ name }: { name: string }) {
  const greet = formatGreeting
  const greeting = `Hello, ${name}!`

  // Keep the fixture buildable even when the compiler loses the hoisted binding.
  if (typeof greet !== 'function') {
    return <p id="missing-greet-action">Missing greeting action</p>
  }

  return <GreetingForm greetAction={greet} />

  async function formatGreeting() {
    'use cache'

    return greeting
  }
}
