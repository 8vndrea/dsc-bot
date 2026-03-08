const { SlashCommandBuilder } = require("discord.js");
const { get, run } = require("../db");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("death")
    .setDescription("Affiche le nombre de morts d'un joueur")
    .addStringOption(option =>
      option
        .setName("joueur")
        .setDescription("Pseudo du joueur")
        .setRequired(true)
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const playerName = interaction.options.getString("joueur").trim().toLowerCase();
    const updatedBy = interaction.user.id;

    try {
      await run(
        `
        INSERT INTO deaths (guild_id, player_name, count, updated_by)
        VALUES (?, ?, 0, ?)
        ON CONFLICT(guild_id, player_name) DO NOTHING
        `,
        [guildId, playerName, updatedBy]
      );

      const row = await get(
        `SELECT player_name, count FROM deaths WHERE guild_id = ? AND player_name = ?`,
        [guildId, playerName]
      );

      await interaction.reply({
        content: `💀 **${row.player_name}** est mort **${row.count}** fois.`
      });
    } catch (error) {
      console.error(error);
      await interaction.reply({
        content: "❌ Erreur lors de la récupération du compteur de morts.",
        ephemeral: true
      });
    }
  }
};