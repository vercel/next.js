import { Tigris } from "@tigrisdata/core";

const tigrisClient = new Tigris();
const tigrisDb = tigrisClient.getDatabase();

// export to share DB across modules
export default tigrisDb;
