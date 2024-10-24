import Head from "next/head";
import { GetServerSideProps } from "next";
import cosmos from "../lib/cosmosdb";

export type Props = {
  isConnected: boolean;
  database?: {
    name?: string;
    isConnected: boolean;
    numOfContainers?: number;
  };
  container?: {
    isConnected: boolean;
    name?: string;
  };
};

const Home = (props: Props) => {
  return (
    <div className="container">
      <Head>
        <title>Next.js + Azure Cosmos DB</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <h1 className="title">
        Welcome to <a href="https://nextjs.org">Next.js with CosmosDB!</a>
      </h1>
      {props.isConnected ? (
        <h2 className="subtitle">You are connected to CosmosDB</h2>
      ) : (
        <h2 className="subtitle">
          You are NOT connected to CosmosDB. Check the <code>README.md</code>{" "}
          for instructions.
        </h2>
      )}

      <p className="description">
        Get started by editing <code>pages/index.js</code>
      </p>

      {props.isConnected ? (
        <div className="main">
          <div className="grid">
            <div className="card">
              <h3>Database </h3>
              <p>Name: {props.database?.name}</p>
              <div>{`Number of Containers : ${props.database?.numOfContainers}`}</div>
              <div>{`Status : ${
                props.database?.isConnected ? "Connected" : "Not Connected"
              }`}</div>
            </div>
            <div className="card">
              <h3>Container</h3>
              <p>Name: {props.container?.name}</p>
              <div>{`Status : ${
                props.database?.isConnected ? "Connected" : "Not Connected"
              }`}</div>
            </div>
          </div>
        </div>
      ) : (
        <div></div>
      )}

      <style jsx>{`
        .container {
          min-height: 100vh;
          padding: 0 0.5rem;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
        }

        .main {
          padding: 3rem 0;
          flex: 1;
          display: flex;
          flex-direction: row;
          justify-content: center;
          align-items: center;
        }
        .grid {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-wrap: wrap;
          flex-direction: column;
          max-width: 1000px;
          margin-top: 1rem;
        }

        .card {
          margin: 1rem;
          flex-basis: 45%;
          padding: 1.5rem;
          text-align: left;
          color: inherit;
          text-decoration: none;
          border: 1px solid #eaeaea;
          border-radius: 10px;
          transition: color 0.15s ease, border-color 0.15s ease;
        }

        .card:hover,
        .card:focus,
        .card:active {
          color: #0070f3;
          border-color: #0070f3;
        }

        .card h3 {
          margin: 0 0 1rem 0;
          font-size: 1.5rem;
        }

        .card p {
          margin: 0;
          font-size: 1.25rem;
          line-height: 1.5;
        }

        .card h4 {
          margin: 0;
          font-size: 1.25rem;
          line-height: 1;
        }
      `}</style>

      <style jsx global>{`
        html,
        body {
          padding: 0;
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto,
            Oxygen, Ubuntu, Cantarell, Fira Sans, Droid Sans, Helvetica Neue,
            sans-serif;
        }

        * {
          box-sizing: border-box;
        }
      `}</style>
    </div>
  );
};

export default Home;

export const getServerSideProps: GetServerSideProps<Props> = async () => {
  const props: Props = {
    isConnected: false,
  };

  if (cosmos.connected) {
    props.isConnected = true;
    try {
      const { resource: database } = await cosmos.database!.read();
      const containerIterator = cosmos.database!.containers.query({
        query: "SELECT * from p",
      });
      const { resources: containers } = await containerIterator.fetchAll();
      props.database = {
        isConnected: true,
        name: database?.id,
        numOfContainers: containers.length,
      };
    } catch {
      props.database = {
        isConnected: false,
      };
    }
    try {
      const { resource: container } = await cosmos.container!.read();
      props.container = {
        isConnected: true,
        name: container?.id,
      };
    } catch {
      props.database = {
        isConnected: false,
      };
    }
  }
  return {
    props,
  };
};
