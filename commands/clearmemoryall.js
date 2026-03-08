const { SlashCommandBuilder } = require("discord.js");
const { run } = require("../db");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("clearmemoryall")
    .setDescription("Supprime toute la mémoire du serveur : longue + courte"),

  async execute(interaction) {
    const guildId = interaction.guildId;

    try {
      await run(
        `DELETE FROM conversation_memory WHERE guild_id = ?`,
        [guildId]
      );

      await run(
        `DELETE FROM server_memory WHERE guild_id = ?`,
        [guildId]
      );

      await interaction.reply({
        content:
          "🗑️ Toute la mémoire du serveur a été supprimée.\n" +
          "Cela inclut la mémoire longue et toute la mémoire courte des salons."
      });
    } catch (error) {
      console.error(error);
      await interaction.reply({
        content: "❌ Erreur lors de la suppression complète de la mémoire."
      });
    }
  }
};