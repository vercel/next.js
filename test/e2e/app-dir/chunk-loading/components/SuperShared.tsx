import { thingOne } from '../app/_components/junk-drawer/thingOne'
import { thingTwo } from '../app/_components/junk-drawer/thingTwo'

export function SuperShared({ from }: { from: 'flight' | 'fizz' | 'dynamic' }) {
  const phrase =
    from === 'flight'
      ? 'loaded on the server (RSC)'
      : from === 'fizz'
        ? 'loaded on the client (Fizz/Fiber)'
        : from === 'dynamic'
          ? 'loaded dynamically'
          : 'not configured to say where it was loaded'

  if (typeof globalThis.UNKNOWN_GLOBAL_BINDING === 'boolean') {
    thingOne()
    let foo =
      'I need to use up significant bytes to make this file be split into its own chunk'
    foo = 'to do that I am going to add a lot of big string such as this one'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    foo =
      'I should just alternately repeat this and another string over and over again'
    foo =
      'This is the other repeating string. It should be about the same length'
    console.log('foo', foo)
    thingTwo()
  }
  return (
    <p>
      this component is part of the server graph and the client graph. It is
      also going to be dynamically imported by webpack. This particular instance
      was {phrase}.
    </p>
  )
}
