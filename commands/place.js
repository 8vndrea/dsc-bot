const { SlashCommandBuilder } = require("discord.js");
const { get } = require("../db");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("place")
    .setDescription("Affiche un lieu enregistré")
    .addStringOption(option =>
      option
        .setName("nom")
        .setDescription("Nom du lieu")
        .setRequired(true)
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const name = interaction.options.getString("nom").trim().toLowerCase();

    try {
      const place = await get(
        `SELECT * FROM places WHERE guild_id = ? AND name = ?`,
        [guildId, name]
      );

      if (!place) {
        return interaction.reply({
          content: `❌ Aucun lieu trouvé pour **${name}**.`,
          ephemeral: true
        });
      }

      await interaction.reply({
        content:
          `📌 **${place.name}**\n` +
          `📍 X: **${place.x}** | Y: **${place.y}** | Z: **${place.z}**\n` +
          `🌍 Dimension : **${place.dimension}**`
      });
    } catch (error) {
      console.error(error);
      await interaction.reply({
        content: "❌ Erreur lors de la récupération du lieu.",
        ephemeral: true
      });
    }
  }
};