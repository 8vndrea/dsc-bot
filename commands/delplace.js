const { SlashCommandBuilder } = require("discord.js");
const { run } = require("../db");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("delplace")
    .setDescription("Supprime un lieu enregistré")
    .addStringOption(option =>
      option
        .setName("nom")
        .setDescription("Nom du lieu à supprimer")
        .setRequired(true)
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const name = interaction.options.getString("nom").trim().toLowerCase();

    try {
      const result = await run(
        `DELETE FROM places WHERE guild_id = ? AND name = ?`,
        [guildId, name]
      );

      if (result.changes === 0) {
        return interaction.reply({
          content: `❌ Aucun lieu trouvé pour **${name}**.`,
          ephemeral: true
        });
      }

      await interaction.reply({
        content: `🗑️ Lieu supprimé : **${name}**`
      });
    } catch (error) {
      console.error(error);
      await interaction.reply({
        content: "❌ Erreur lors de la suppression du lieu.",
        ephemeral: true
      });
    }
  }
};