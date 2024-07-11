import dbConnect from "../lib/dbConnect";

async function globalTeardown() {
  dbConnect().then(async (connection) => {
    await connection.disconnect();
  });
}

export default globalTeardown;
