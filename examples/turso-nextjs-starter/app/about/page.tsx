import Link from 'next/link';

export const runtime = 'edge';

export const metadata = {
  title: 'About Us',
  description: 'Top web frameworks about page',
};

export default async function AboutPage() {
  return (
    <>
      <h1> About Us </h1>

      <p className="text-center pt-5">
        <span className="font-semibold">Top Web Frameworks</span> lists the top
        frameworks for web development based on their GitHub stars count.
      </p>

      <p className="text-center pt-5">
        Feel free to contribute to the list by{' '}
        <Link href="/add-new" className="underline hover:text-teal-800">
          making a new submission.
        </Link>
      </p>
    </>
  );
}
