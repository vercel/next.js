const request = require("request");
const url = "https://dog.ceo/api/breeds/image/random";

(async () => {
  await new Promise((resolve, reject) => {
    request.get(url, { json: true }, (err, resp, body) => {
      if (err) return reject(err);
      if (body.status != "success") {
        return reject(new Error("Bad api response: " + JSON.stringify(body)));
      }
      resolve();
    });
  });
})();
