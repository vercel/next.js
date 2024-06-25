import { Container, CosmosClient, Database } from "@azure/cosmos";

export type Cosmos = {
  connected: boolean;
  client?: CosmosClient;
  database?: Database;
  container?: Container;
};

if (!process.env.COSMOSDB_CONNECTION_STRING) {
  throw new Error(
    'Invalid/Missing environment variable: "COSMOSDB_CONNECTION_STRING"',
  );
}

if (!process.env.COSMOSDB_DATABASE_NAME) {
  throw new Error(
    'Invalid/Missing environment variable: "COSMOSDB_DATABASE_NAME"',
  );
}

if (!process.env.COSMOSDB_CONTAINER_NAME) {
  throw new Error(
    'Invalid/Missing environment variable: "COSMOSDB_CONTAINER_NAME"',
  );
}

const connectionString = process.env.COSMOSDB_CONNECTION_STRING;
const databaseName = process.env.COSMOSDB_DATABASE_NAME;
const containerName = process.env.COSMOSDB_CONTAINER_NAME;

let client;
let database;
let container;

const cosmos: Cosmos = {
  connected: true,
  client,
  database,
  container,
};

try {
  client = new CosmosClient(connectionString);
  database = client.database(databaseName);
  container = database.container(containerName);

  cosmos.connected = true;
  cosmos.client = client;
  cosmos.database = database;
  cosmos.container = container;
} catch (err) {
  cosmos.connected = false;
  console.log(err);
}

export default cosmos;
