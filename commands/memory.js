const { SlashCommandBuilder } = require("discord.js");
const { get } = require("../db");

function splitMessage(text, maxLength = 1900) {
  const chunks = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    let slice = remaining.slice(0, maxLength);

    const lastBreak = Math.max(
      slice.lastIndexOf("\n"),
      slice.lastIndexOf(". "),
      slice.lastIndexOf("! "),
      slice.lastIndexOf("? ")
    );

    if (lastBreak > 200) {
      slice = remaining.slice(0, lastBreak + 1);
    }

    chunks.push(slice.trim());
    remaining = remaining.slice(slice.length).trim();
  }

  if (remaining.length) {
    chunks.push(remaining);
  }

  return chunks;
}

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
        `**Stage** : ${row.stage || "debut"}\n` +
        `**Nether atteint** : ${row.has_nether ? "oui" : "non"}\n` +
        `**Forteresse trouvée** : ${row.has_fortress ? "oui" : "non"}\n` +
        `**End accessible** : ${row.has_end_access ? "oui" : "non"}\n` +
        `**Dragon tué** : ${row.killed_dragon ? "oui" : "non"}\n\n` +
        `**Farms** :\n${farmsText}\n\n` +
        `**Notes** : ${row.notes || "aucune"}\n\n` +
        `**Dernier résumé** : ${row.last_progress_summary || "aucun"}\n\n` +
        `**Dernier objectif** : ${row.last_objective || "aucun"}`;

      const parts = splitMessage(content);

      await interaction.reply({ content: parts[0] });

      for (let i = 1; i < parts.length; i++) {
        await interaction.followUp({ content: parts[i] });
      }
    } catch (error) {
      console.error(error);
      await interaction.reply({
        content: "❌ Erreur lors de la lecture de la mémoire."
      });
    }
  }
};