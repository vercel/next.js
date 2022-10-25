const canvas = require("canvas");
module.exports = () => {
  const { createCanvas } = canvas;
  const c = createCanvas(200, 200);
  const ctx = c.getContext("2d");
};
