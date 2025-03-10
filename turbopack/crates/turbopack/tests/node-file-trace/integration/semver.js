const semver = require("semver");

const v1 = "1.0.0";
const v2 = "2.0.0";

semver.gt(v1, v2);
semver.lt(v1, v2);
semver.eq(v1, v2);
semver.coerce(v1);
