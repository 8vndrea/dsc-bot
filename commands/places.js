const { SlashCommandBuilder } = require("discord.js");
const { all } = require("../db");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("places")
    .setDescription("Liste tous les lieux enregistrés du serveur"),

  async execute(interaction) {
    const guildId = interaction.guildId;

    try {
      const places = await all(
        `SELECT name, x, y, z, dimension FROM places WHERE guild_id = ? ORDER BY name ASC`,
        [guildId]
      );

      if (!places.length) {
        return interaction.reply({
          content: "📭 Aucun lieu enregistré pour ce serveur."
        });
      }

      const lines = places.map(
        place =>
          `• **${place.name}** → X:${place.x} Y:${place.y} Z:${place.z} | ${place.dimension}`
      );

      await interaction.reply({
        content: `📚 **Lieux enregistrés :**\n${lines.join("\n")}`
      });
    } catch (error) {
      console.error(error);
      await interaction.reply({
        content: "❌ Erreur lors de la récupération des lieux.",
        ephemeral: true
      });
    }
  }
};