const { SlashCommandBuilder } = require("discord.js");
const { run } = require("../db");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("resetmemory")
    .setDescription("Vide la mémoire courte du salon actuel"),

  async execute(interaction) {
    try {
      await run(
        `
        DELETE FROM conversation_memory
        WHERE guild_id = ? AND channel_id = ?
        `,
        [interaction.guildId, interaction.channelId]
      );

      await interaction.reply({
        content: "🧹 La mémoire courte de ce salon a été vidée."
      });
    } catch (error) {
      console.error(error);
      await interaction.reply({
        content: "❌ Erreur lors de la suppression de la mémoire courte."
      });
    }
  }
};