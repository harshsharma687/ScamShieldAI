/**
 * Initialises every Sequelize model on one shared connection and wires up the
 * relationships:
 *
 *   User 1 ── N Scan 1 ── N DetectionResult
 *   User 1 ── N RefreshToken
 */
const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const User = require("./User")(sequelize, DataTypes);
const Scan = require("./Scan")(sequelize, DataTypes);
const DetectionResult = require("./DetectionResult")(sequelize, DataTypes);
const RefreshToken = require("./RefreshToken")(sequelize, DataTypes);

const models = { User, Scan, DetectionResult, RefreshToken };

Object.values(models).forEach((model) => {
  if (typeof model.associate === "function") {
    model.associate(models);
  }
});

module.exports = { ...models, sequelize };
