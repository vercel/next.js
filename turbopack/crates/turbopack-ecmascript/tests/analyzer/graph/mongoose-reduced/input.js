const driver = global.MONGOOSE_DRIVER_PATH || "./drivers/node-mongodb-native";

/*!
 * Connection
 */

const Connection = require(driver + "/connection");

/*!
 * Collection
 */

const Collection = require(driver + "/collection");
