const { Logger } = require("nightwatch");

module.exports = class Command {
  command(number) {
    Logger.log(` > Hello test number ${number} (custom command)`);

    return Promise.resolve();
  }
};
