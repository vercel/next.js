import React from 'react';
import Link from 'next/link';
import faker from 'faker';

export default function({ name }) {
  return (
    <div>
      <Link href="/about">
        <h1>Home Page</h1>
        <p>Welcome, {name}</p>
        <a>About Page</a>
      </Link>
    </div>
  );
}

export async function getStaticProps() {
  // The name will be generated at build time only
  const name = faker.name.findName();

  return {
    props: { name },
  };
}
