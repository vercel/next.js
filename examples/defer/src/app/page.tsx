import { sayHello } from "@/actions/sayHello";

export default function Home() {
  const sayHelloJohn = sayHello.bind(null, "John");
  return (
    <main>
      <div>
        <form action={sayHelloJohn}>
          <button type="submit">Say "Hello John" on Defer</button>
        </form>
      </div>
    </main>
  );
}
