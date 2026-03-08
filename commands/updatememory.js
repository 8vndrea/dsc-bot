const { SlashCommandBuilder } = require("discord.js");
const { get, run } = require("../db");

function parseBoolean(value) {
  const v = value.trim().toLowerCase();

  if (["true", "1", "oui", "yes", "y"].includes(v)) return 1;
  if (["false", "0", "non", "no", "n"].includes(v)) return 0;

  return null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("updatememory")
    .setDescription("Met à jour une info de la mémoire longue du serveur")
    .addStringOption(option =>
      option
        .setName("cle")
        .setDescription("Clé à modifier")
        .setRequired(true)
        .addChoices(
          { name: "stage", value: "stage" },
          { name: "has_nether", value: "has_nether" },
          { name: "has_fortress", value: "has_fortress" },
          { name: "has_end_access", value: "has_end_access" },
          { name: "killed_dragon", value: "killed_dragon" },
          { name: "notes", value: "notes" },
          { name: "last_progress_summary", value: "last_progress_summary" }
        )
    )
    .addStringOption(option =>
      option
        .setName("valeur")
        .setDescription("Nouvelle valeur")
        .setRequired(true)
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const key = interaction.options.getString("cle");
    const rawValue = interaction.options.getString("valeur").trim();

    try {
      const existing = await get(
        `SELECT * FROM server_memory WHERE guild_id = ?`,
        [guildId]
      );

      if (!existing) {
        await run(
          `
          INSERT INTO server_memory (
            guild_id,
            stage,
            has_nether,
            has_fortress,
            has_end_access,
            killed_dragon,
            farms,
            notes,
            last_progress_summary,
            updated_at
          )
          VALUES (?, 'debut', 0, 0, 0, 0, '[]', '', '', CURRENT_TIMESTAMP)
          `,
          [guildId]
        );
      }

      let finalValue = rawValue;

      if (
        ["has_nether", "has_fortress", "has_end_access", "killed_dragon"].includes(
          key
        )
      ) {
        const parsed = parseBoolean(rawValue);

        if (parsed === null) {
          return interaction.reply({
            content:
              "❌ Pour cette clé, utilise une valeur booléenne : `true`, `false`, `oui`, `non`, `1` ou `0`."
          });
        }

        finalValue = parsed;
      }

      if (key === "stage") {
        const allowedStages = ["debut", "milieu", "nether", "end", "late"];
        const normalized = rawValue.toLowerCase();

        if (!allowedStages.includes(normalized)) {
          return interaction.reply({
            content:
              "❌ Valeur invalide pour `stage`. Valeurs acceptées : `debut`, `milieu`, `nether`, `end`, `late`."
          });
        }

        finalValue = normalized;
      }

      await run(
        `
        UPDATE server_memory
        SET ${key} = ?, updated_at = CURRENT_TIMESTAMP
        WHERE guild_id = ?
        `,
        [finalValue, guildId]
      );

      await interaction.reply({
        content: `🧠 Mémoire mise à jour : **${key}** = **${rawValue}**`
      });
    } catch (error) {
      console.error(error);
      await interaction.reply({
        content: "❌ Erreur lors de la mise à jour de la mémoire."
      });
    }
  }
};