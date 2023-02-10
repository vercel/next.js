const http = require("http");
const { spawn } = require("child_process");

let serverProcess;

const isServerActive = () => {
  const url = "http://localhost:3000";

  return new Promise((resolve) => {
    http
      .get(url, (res) => {
        resolve(res.statusCode === 200);
      })
      .on("error", () => {
        resolve(false);
      });
  });
};

module.exports = {
  // Start Next.js server before running tests
  before: async function (browser, done) {
    const active = await isServerActive();

    if (!active) {
      serverProcess = spawn(/^win/.test(process.platform) ? "npm.cmd" : "npm", [
        "run",
        "dev",
      ]);

      serverProcess.stdout.on("data", (data) => {
        if (data.toString().includes("ready")) {
          done();
        }
      });
    } else {
      done();
    }
  },

  // Kill Next.js server after running tests
  after: function (browser, done) {
    if (serverProcess) {
      if (/^win/.test(process.platform)) {
        spawn("taskkill", ["/pid", serverProcess.pid, "/f", "/t"]);
      } else {
        serverProcess.kill("SIGINT");
      }
    }

    done();
  },
};
