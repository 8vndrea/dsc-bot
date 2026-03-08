const { SlashCommandBuilder } = require("discord.js");
const { get, run } = require("../db");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setdeath")
    .setDescription("Définit le nombre de morts d'un joueur")
    .addStringOption(option =>
      option
        .setName("joueur")
        .setDescription("Pseudo du joueur")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("nombre")
        .setDescription("Nombre de morts")
        .setRequired(true)
        .setMinValue(0)
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const playerName = interaction.options.getString("joueur").trim().toLowerCase();
    const count = interaction.options.getInteger("nombre");
    const updatedBy = interaction.user.id;

    try {
      await run(
        `
        INSERT INTO deaths (guild_id, player_name, count, updated_by)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(guild_id, player_name)
        DO UPDATE SET
          count = excluded.count,
          updated_by = excluded.updated_by,
          updated_at = CURRENT_TIMESTAMP
        `,
        [guildId, playerName, count, updatedBy]
      );

      const row = await get(
        `SELECT player_name, count FROM deaths WHERE guild_id = ? AND player_name = ?`,
        [guildId, playerName]
      );

      await interaction.reply({
        content: `☠️ Compteur défini pour **${row.player_name}** : **${row.count}**`
      });
    } catch (error) {
      console.error(error);
      await interaction.reply({
        content: "❌ Erreur lors de la mise à jour du compteur.",
        ephemeral: true
      });
    }
  }
};