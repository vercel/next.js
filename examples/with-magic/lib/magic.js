const { Magic } = require("@magic-sdk/admin");

export const magic = new Magic(process.env.MAGIC_SECRET_KEY);
