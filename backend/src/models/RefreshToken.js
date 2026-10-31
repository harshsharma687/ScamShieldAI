module.exports = (sequelize, DataTypes) => {
  const RefreshToken = sequelize.define(
    "RefreshToken",
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      // SHA-256 of the signed refresh JWT. The raw token is never stored.
      tokenHash: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      revokedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      // Only a short, already-truncated description of the signing-in device.
      // It is shown back to the account owner in Settings.
      userAgent: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      ipAddress: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      lastUsedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "refresh_tokens",
      timestamps: true,
      updatedAt: false,
      indexes: [
        { unique: true, fields: ["token_hash"] },
        { fields: ["user_id"] },
        { fields: ["expires_at"] },
      ],
    }
  );

  RefreshToken.prototype.toJSON = function toJSON() {
    const values = { ...this.get() };
    delete values.tokenHash;
    return values;
  };

  RefreshToken.associate = (models) => {
    RefreshToken.belongsTo(models.User, {
      foreignKey: "userId",
      as: "user",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
  };

  return RefreshToken;
};
