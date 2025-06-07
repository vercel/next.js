import Link from "next/link";

const IndexPage = () => (
  <>
    <h1>Hello World Page</h1>
    <ol>
      {[1, 2, 3, 4, 5].map((num) => (
        <li key={num}>
          <Link href={`/dynamic/page-${num}`}>Link to dynamic page {num}</Link>
        </li>
      ))}
    </ol>
  </>
);

export default IndexPage;
