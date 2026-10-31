"use strict";

/**
 * Adds device metadata to refresh_tokens so the Settings page can show a list
 * of active sessions ("Chrome on Windows", last used time) and let the owner
 * sign out individual devices.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("refresh_tokens", "user_agent", {
      type: Sequelize.STRING(255),
      allowNull: true,
    });

    await queryInterface.addColumn("refresh_tokens", "ip_address", {
      type: Sequelize.STRING(64),
      allowNull: true,
    });

    await queryInterface.addColumn("refresh_tokens", "last_used_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("refresh_tokens", "last_used_at");
    await queryInterface.removeColumn("refresh_tokens", "ip_address");
    await queryInterface.removeColumn("refresh_tokens", "user_agent");
  },
};
