"use strict";

/** Creates detection_results: the risk verdict attached to a scan. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      "detection_results",
      {
        id: {
          type: Sequelize.INTEGER.UNSIGNED,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false,
        },
        scan_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: "scans", key: "id" },
          onDelete: "CASCADE",
          onUpdate: "CASCADE",
        },
        risk_score: {
          type: Sequelize.TINYINT.UNSIGNED,
          allowNull: false,
        },
        risk_level: {
          type: Sequelize.ENUM("Low", "Medium", "High", "Critical"),
          allowNull: false,
        },
        is_scam: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        explanation: {
          type: Sequelize.TEXT,
          allowNull: false,
        },
        recommendation: {
          type: Sequelize.TEXT,
          allowNull: false,
        },
        detection_source: {
          type: Sequelize.STRING(64),
          allowNull: false,
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

    await queryInterface.addIndex("detection_results", ["scan_id"], {
      name: "detection_results_scan_idx",
    });
    await queryInterface.addIndex("detection_results", ["risk_level"], {
      name: "detection_results_risk_idx",
    });
    await queryInterface.addIndex("detection_results", ["is_scam"], {
      name: "detection_results_is_scam_idx",
    });
    await queryInterface.addIndex("detection_results", ["created_at"], {
      name: "detection_results_created_idx",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("detection_results");
  },
};
