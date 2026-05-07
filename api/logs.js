// api/logs.js
if (!global.runLog) global.runLog = [];

module.exports = (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.json({ logs: global.runLog });
};
