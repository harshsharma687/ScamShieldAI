module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define(
    "User",
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING(80),
        allowNull: false,
        validate: {
          len: { args: [2, 80], msg: "Name must be between 2 and 80 characters." },
        },
      },
      email: {
        type: DataTypes.STRING(191),
        allowNull: false,
        unique: true,
        validate: { isEmail: { msg: "A valid email address is required." } },
        set(value) {
          this.setDataValue("email", String(value).trim().toLowerCase());
        },
      },
      // Always a bcrypt hash. Never expose this field through an API.
      password: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      profileImage: {
        type: DataTypes.STRING(2048),
        allowNull: true,
      },
      // Cloudinary public id for an uploaded photo (null for external URLs).
      profileImagePublicId: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      // A new email is stored here until the owner proves control of it.
      pendingEmail: {
        type: DataTypes.STRING(191),
        allowNull: true,
      },
      emailChangeTokenHash: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      emailChangeExpiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      passwordResetTokenHash: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      passwordResetExpiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "users",
      timestamps: true,
      indexes: [
        { unique: true, fields: ["email"] },
        { fields: ["pending_email"] },
        { fields: ["password_reset_token_hash"] },
      ],
    }
  );

  /**
   * Last line of defence: even if a controller accidentally returns the model
   * directly, password hashes and private tokens are not serialised.
   */
  User.prototype.toJSON = function toJSON() {
    const values = { ...this.get() };

    delete values.password;
    delete values.profileImagePublicId;
    delete values.pendingEmail;
    delete values.emailChangeTokenHash;
    delete values.emailChangeExpiresAt;
    delete values.passwordResetTokenHash;
    delete values.passwordResetExpiresAt;

    return values;
  };

  User.associate = (models) => {
    User.hasMany(models.Scan, {
      foreignKey: "userId",
      as: "scans",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    User.hasMany(models.RefreshToken, {
      foreignKey: "userId",
      as: "refreshTokens",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
  };

  return User;
};
