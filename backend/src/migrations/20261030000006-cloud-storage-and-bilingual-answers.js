"use strict";

/**
 * Cloud image storage + easy bilingual answers.
 *
 * - scans.file_public_id / users.profile_image_public_id hold the Cloudinary
 *   public id, which is required to actually delete the stored image.
 * - detection_results gets a simple Hindi answer and a simple English answer
 *   next to the detailed technical explanation.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("scans", "file_public_id", {
      type: Sequelize.STRING(255),
      allowNull: true,
    });

    await queryInterface.addColumn("users", "profile_image_public_id", {
      type: Sequelize.STRING(255),
      allowNull: true,
    });

    await queryInterface.addColumn("detection_results", "explanation_hi", {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    await queryInterface.addColumn("detection_results", "explanation_en", {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    await queryInterface.addColumn("detection_results", "recommendation_hi", {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    await queryInterface.addColumn("detection_results", "recommendation_en", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("detection_results", "recommendation_en");
    await queryInterface.removeColumn("detection_results", "recommendation_hi");
    await queryInterface.removeColumn("detection_results", "explanation_en");
    await queryInterface.removeColumn("detection_results", "explanation_hi");
    await queryInterface.removeColumn("users", "profile_image_public_id");
    await queryInterface.removeColumn("scans", "file_public_id");
  },
};
