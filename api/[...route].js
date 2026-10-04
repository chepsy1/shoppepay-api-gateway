require("dotenv").config();

const app = require("../shoppepay-api-gateway/server");

module.exports = (req, res) => {
  const route = req.query.route;

  if (Array.isArray(route)) {
    req.url = "/" + route.join("/");
  } else if (typeof route === "string" && route) {
    req.url = route.startsWith("/") ? route : `/${route}`;
  }

  return app(req, res);
};
