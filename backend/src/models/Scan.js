module.exports = (sequelize, DataTypes) => {
  const Scan = sequelize.define(
    "Scan",
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
      scanType: {
        type: DataTypes.ENUM("image", "link", "message"),
        allowNull: false,
      },
      // The submitted URL or message. For images this is the original filename.
      inputValue: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      // Internal path such as "uploads/ab12.png" or a Cloudinary secure URL.
      // It is never served publicly; owners download it through
      // GET /api/scans/:id/file.
      fileUrl: {
        type: DataTypes.STRING(512),
        allowNull: true,
      },
      // Cloudinary public id, used to delete the stored image for real.
      filePublicId: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM("pending", "completed", "failed"),
        allowNull: false,
        defaultValue: "pending",
      },
    },
    {
      tableName: "scans",
      timestamps: true,
      indexes: [
        { fields: ["user_id"] },
        { fields: ["user_id", "created_at"] },
        { fields: ["scan_type"] },
        { fields: ["status"] },
      ],
    }
  );

  Scan.associate = (models) => {
    Scan.belongsTo(models.User, {
      foreignKey: "userId",
      as: "user",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    Scan.hasMany(models.DetectionResult, {
      foreignKey: "scanId",
      as: "detectionResults",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
  };

  return Scan;
};
