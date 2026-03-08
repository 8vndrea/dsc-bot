const { SlashCommandBuilder } = require("discord.js");
const { get, run } = require("../db");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("adddeath")
    .setDescription("Ajoute une mort à un joueur")
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
        VALUES (?, ?, 1, ?)
        ON CONFLICT(guild_id, player_name)
        DO UPDATE SET
          count = count + 1,
          updated_by = excluded.updated_by,
          updated_at = CURRENT_TIMESTAMP
        `,
        [guildId, playerName, updatedBy]
      );

      const row = await get(
        `SELECT player_name, count FROM deaths WHERE guild_id = ? AND player_name = ?`,
        [guildId, playerName]
      );

      await interaction.reply({
        content: `💀 Une mort ajoutée pour **${row.player_name}**.\nTotal : **${row.count}**`
      });
    } catch (error) {
      console.error(error);
      await interaction.reply({
        content: "❌ Erreur lors de l'ajout de la mort.",
        ephemeral: true
      });
    }
  }
};