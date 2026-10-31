"use strict";

/** Creates the users table: one row per registered account. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      "users",
      {
        id: {
          type: Sequelize.INTEGER.UNSIGNED,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false,
        },
        name: {
          type: Sequelize.STRING(80),
          allowNull: false,
        },
        email: {
          type: Sequelize.STRING(191),
          allowNull: false,
        },
        password: {
          type: Sequelize.STRING(255),
          allowNull: false,
        },
        profile_image: {
          type: Sequelize.STRING(2048),
          allowNull: true,
        },
        pending_email: {
          type: Sequelize.STRING(191),
          allowNull: true,
        },
        email_change_token_hash: {
          type: Sequelize.STRING(64),
          allowNull: true,
        },
        email_change_expires_at: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        password_reset_token_hash: {
          type: Sequelize.STRING(64),
          allowNull: true,
        },
        password_reset_expires_at: {
          type: Sequelize.DATE,
          allowNull: true,
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

    await queryInterface.addIndex("users", ["email"], {
      unique: true,
      name: "users_email_unique",
    });
    await queryInterface.addIndex("users", ["pending_email"], {
      name: "users_pending_email_idx",
    });
    await queryInterface.addIndex("users", ["password_reset_token_hash"], {
      name: "users_password_reset_token_idx",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("users");
  },
};
