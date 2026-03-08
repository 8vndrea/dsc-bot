const { SlashCommandBuilder } = require("discord.js");
const { all } = require("../db");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("topdeath")
    .setDescription("Affiche le classement des morts"),

  async execute(interaction) {
    const guildId = interaction.guildId;

    try {
      const rows = await all(
        `
        SELECT player_name, count
        FROM deaths
        WHERE guild_id = ?
        ORDER BY count DESC, player_name ASC
        LIMIT 10
        `,
        [guildId]
      );

      if (!rows.length) {
        return interaction.reply({
          content: "📭 Aucun compteur de morts enregistré."
        });
      }

      const lines = rows.map((row, index) => {
        return `**${index + 1}.** ${row.player_name} — **${row.count}** morts`;
      });

      await interaction.reply({
        content: `🏆 **Classement des morts**\n\n${lines.join("\n")}`
      });
    } catch (error) {
      console.error(error);
      await interaction.reply({
        content: "❌ Erreur lors de la récupération du classement.",
        ephemeral: true
      });
    }
  }
};