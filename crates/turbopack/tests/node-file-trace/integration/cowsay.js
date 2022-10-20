const { say } = require("cowsay");

const nate = say({ text: "nate" });
if (!(nate.indexOf("nate") > 0)) {
  throw new Error('cowsay did not work. String "nate" not found in: ' + nate);
}
