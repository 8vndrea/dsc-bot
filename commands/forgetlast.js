const { SlashCommandBuilder } = require("discord.js");
const { all, run } = require("../db");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("forgetlast")
    .setDescription("Supprime le dernier échange mémoire du salon"),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const channelId = interaction.channelId;

    try {
      const rows = await all(
        `
        SELECT id
        FROM conversation_memory
        WHERE guild_id = ? AND channel_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 2
        `,
        [guildId, channelId]
      );

      if (!rows.length) {
        return interaction.reply({
          content: "🧠 Il n'y a rien à oublier dans la mémoire du salon.",
          ephemeral: true
        });
      }

      const ids = rows.map(r => r.id);
      const placeholders = ids.map(() => "?").join(",");

      await run(
        `DELETE FROM conversation_memory WHERE id IN (${placeholders})`,
        ids
      );

      await interaction.reply({
        content: "🧹 Le dernier échange mémoire a été supprimé."
      });

    } catch (error) {
      console.error("Erreur forgetlast:", error);

      await interaction.reply({
        content: "❌ Erreur lors de la suppression de la mémoire.",
        ephemeral: true
      });
    }
  }
};