const { SlashCommandBuilder } = require("discord.js");
const { get } = require("../db");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("memory")
    .setDescription("Affiche la mémoire actuelle du serveur"),

  async execute(interaction) {
    try {
      const row = await get(
        `SELECT * FROM server_memory WHERE guild_id = ?`,
        [interaction.guildId]
      );

      if (!row) {
        return interaction.reply({
          content: "🧠 Aucune mémoire longue enregistrée pour ce serveur."
        });
      }

      let farms = [];
      try {
        farms = JSON.parse(row.farms || "[]");
      } catch (_) {
        farms = [];
      }

      const farmsText = farms.length
        ? farms.map(f => `• ${f.name} — ${f.status}`).join("\n")
        : "Aucune farm mémorisée";

      const content =
        `🧠 **Mémoire du serveur**\n\n` +
        `**Stage** : ${row.stage}\n` +
        `**Nether atteint** : ${row.has_nether ? "oui" : "non"}\n` +
        `**Forteresse trouvée** : ${row.has_fortress ? "oui" : "non"}\n` +
        `**End accessible** : ${row.has_end_access ? "oui" : "non"}\n` +
        `**Dragon tué** : ${row.killed_dragon ? "oui" : "non"}\n\n` +
        `**Farms** :\n${farmsText}\n\n` +
        `**Notes** : ${row.notes || "aucune"}\n\n` +
        `**Dernier résumé** : ${row.last_progress_summary || "aucun"}`;

      await interaction.reply({ content });
    } catch (error) {
      console.error(error);
      await interaction.reply({
        content: "❌ Erreur lors de la lecture de la mémoire."
      });
    }
  }
};