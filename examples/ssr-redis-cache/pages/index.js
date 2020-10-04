import Head from 'next/head'
import styles from '../styles/Home.module.css'

const Home = ({ pokemons }) => (
    <div className={styles.container}>
      <Head>
        <title>Create Next App</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
        <h1 className={styles.title}>
          Board of <a href="https://nextjs.org">Pokemons</a>
        </h1>

        <p className={styles.description}>List of all thousands of pokemons.</p>

        <div className={styles.grid}>
          {pokemons?.results?.map((pokemon) => (
            <a href={pokemon.url} className={styles.card} key={pokemon.name}>
              <h3>{pokemon.name} &rarr;</h3>
            </a>
          ))}
        </div>
      </main>

      <footer className={styles.footer}>
        <a
          href="https://vercel.com?utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          Powered by{" "}
          <img src="/vercel.svg" alt="Vercel Logo" className={styles.logo} />
        </a>
      </footer>
    </div>
  );



Home.getInitialProps = async () => {
    const res = await fetch("https://pokeapi.co/api/v2/pokemon?limit=1000");
    const pokemons = await res.json()
    return {
      pokemons,
    };
}

export default Home;