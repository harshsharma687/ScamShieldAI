"use strict";

/** Creates refresh_tokens for rotation, revocation and reuse detection. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      "refresh_tokens",
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
        token_hash: {
          type: Sequelize.STRING(64),
          allowNull: false,
        },
        expires_at: {
          type: Sequelize.DATE,
          allowNull: false,
        },
        revoked_at: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        created_at: {
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

    await queryInterface.addIndex("refresh_tokens", ["token_hash"], {
      unique: true,
      name: "refresh_tokens_hash_unique",
    });
    await queryInterface.addIndex("refresh_tokens", ["user_id"], {
      name: "refresh_tokens_user_idx",
    });
    await queryInterface.addIndex("refresh_tokens", ["expires_at"], {
      name: "refresh_tokens_expires_idx",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("refresh_tokens");
  },
};
