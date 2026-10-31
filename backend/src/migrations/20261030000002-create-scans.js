"use strict";

/** Creates the scans table. Each row belongs to exactly one user. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      "scans",
      {
        id: {
          type: Sequelize.INTEGER.UNSIGNED,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false,
        },
        user_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: "users", key: "id" },
          onDelete: "CASCADE",
          onUpdate: "CASCADE",
        },
        scan_type: {
          type: Sequelize.ENUM("image", "link", "message"),
          allowNull: false,
        },
        input_value: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        file_url: {
          type: Sequelize.STRING(512),
          allowNull: true,
        },
        status: {
          type: Sequelize.ENUM("pending", "completed", "failed"),
          allowNull: false,
          defaultValue: "pending",
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
        },
      },
      {
        charset: "utf8mb4",
        collate: "utf8mb4_unicode_ci",
      }
    );

    await queryInterface.addIndex("scans", ["user_id"], {
      name: "scans_user_id_idx",
    });
    await queryInterface.addIndex("scans", ["user_id", "created_at"], {
      name: "scans_user_created_idx",
    });
    await queryInterface.addIndex("scans", ["scan_type"], {
      name: "scans_type_idx",
    });
    await queryInterface.addIndex("scans", ["status"], {
      name: "scans_status_idx",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("scans");
  },
};
