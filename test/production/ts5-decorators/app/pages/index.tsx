// Stage-3/TS5 decorator — no experimentalDecorators flag required
function logged<T extends (...args: any[]) => any>(
  target: T,
  context: ClassMethodDecoratorContext
) {
  return function (this: any, ...args: Parameters<T>): ReturnType<T> {
    console.log(`Calling ${String(context.name)}`)
    return target.apply(this, args)
  }
}

class Greeter {
  @logged
  greet(name: string) {
    return `Hello, ${name}!`
  }
}

export default function Home() {
  const g = new Greeter()
  return <p id="result">{g.greet('world')}</p>
}
