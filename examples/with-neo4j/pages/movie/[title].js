import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import useSWR from "swr";
import fetcher from "../../lib/fetcher";
import Header from "../../components/header";
import Footer from "../../components/footer";

export default function Movie() {
  const router = useRouter();
  const { title } = router.query;
  const { data, error } = useSWR(`/api/movies/${title}`, fetcher);

  if (error) return <div>failed to load</div>;
  if (!data) return <div>loading...</div>;

  return (
    <div className="container">
      <Head>
        <title>Next with Neo4j</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <Header title={title} />

      <main>
        <div className="movie">
          <div className="info">
            <h2>Information</h2>
            <div>
              <strong>Tagline: </strong>
              {data.movie.tagline}
            </div>
            <div>
              <strong>Released: </strong>
              {data.movie.released}
            </div>
          </div>
          <div className="actors">
            <h2>Actors</h2>
            {data.movie.actors.map((actor) => (
              <div key={actor}>
                <Link
                  key={actor}
                  href={`/actor/${encodeURIComponent(actor)}`}
                  legacyBehavior
                >
                  <a className="link">{actor}</a>
                </Link>
              </div>
            ))}
          </div>
          <div className="directors">
            <h2>Directors</h2>
            {data.movie.directed.map((director) => (
              <div key={director}>{director}</div>
            ))}
          </div>
        </div>

        <div className="back">
          <Link href="/" legacyBehavior>
            <a>🔙 Go Back</a>
          </Link>
        </div>
      </main>

      <Footer />

      <style jsx>
        {`
          .container {
            width: 100vw;
            min-height: 100vh;
            padding: 0 0.5rem;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
          }
          main {
            display: flex;
            width: 100%;
            justify-content: center;
            padding: 2rem 0;
            text-align: center;
            flex-direction: column;
          }
          .movie {
            margin-bottom: 2rem;
          }
          .movie a {
            text-decoration: underline;
          }
          .back {
            padding: 1rem 0;
          }
          .back a {
            font-weight: bold;
          }
        `}
      </style>
    </div>
  );
}
