import Link from "next/link";
import { faker } from "@faker-js/faker";

export default function Home() {
  const name = faker.person.fullName();
  return (
    <div>
      <h1>Home Page</h1>
      <p>Welcome, {name}</p>
      <div>
        <Link href="/about">About Page</Link>
      </div>
    </div>
  );
}
