module.exports = (sequelize, DataTypes) => {
  const DetectionResult = sequelize.define(
    "DetectionResult",
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      scanId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      riskScore: {
        type: DataTypes.TINYINT.UNSIGNED,
        allowNull: false,
        validate: {
          min: 0,
          max: 100,
        },
      },
      riskLevel: {
        type: DataTypes.ENUM("Low", "Medium", "High", "Critical"),
        allowNull: false,
      },
      isScam: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      explanation: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      recommendation: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      // Examples: "ai+heuristics", "heuristic-fallback", "ai-vision".
      detectionSource: {
        type: DataTypes.STRING(64),
        allowNull: false,
      },
    },
    {
      tableName: "detection_results",
      timestamps: true,
      updatedAt: false,
      indexes: [
        { fields: ["scan_id"] },
        { fields: ["risk_level"] },
        { fields: ["is_scam"] },
        { fields: ["created_at"] },
      ],
    }
  );

  DetectionResult.associate = (models) => {
    DetectionResult.belongsTo(models.Scan, {
      foreignKey: "scanId",
      as: "scan",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
  };

  return DetectionResult;
};
