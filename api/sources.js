// api/sources.js
const { SOURCES } = require("./agent");

module.exports = (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.json({ sources: SOURCES });
};
