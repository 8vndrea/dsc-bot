const { SlashCommandBuilder } = require("discord.js");
const { run } = require("../db");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("set")
    .setDescription("Enregistre un lieu avec un nom et des coordonnées")
    .addStringOption(option =>
      option
        .setName("nom")
        .setDescription("Nom du lieu")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("x")
        .setDescription("Coordonnée X")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("y")
        .setDescription("Coordonnée Y")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("z")
        .setDescription("Coordonnée Z")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("dimension")
        .setDescription("Dimension du lieu")
        .setRequired(true)
        .addChoices(
          { name: "Overworld", value: "overworld" },
          { name: "Nether", value: "nether" },
          { name: "End", value: "end" }
        )
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const name = interaction.options.getString("nom").trim().toLowerCase();
    const x = interaction.options.getInteger("x");
    const y = interaction.options.getInteger("y");
    const z = interaction.options.getInteger("z");
    const dimension = interaction.options.getString("dimension");
    const createdBy = interaction.user.id;

    try {
      await run(
        `
        INSERT INTO places (guild_id, name, x, y, z, dimension, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(guild_id, name)
        DO UPDATE SET
          x = excluded.x,
          y = excluded.y,
          z = excluded.z,
          dimension = excluded.dimension,
          created_by = excluded.created_by
        `,
        [guildId, name, x, y, z, dimension, createdBy]
      );

      await interaction.reply({
        content:
          `✅ Lieu enregistré : **${name}**\n` +
          `📍 X: **${x}** | Y: **${y}** | Z: **${z}**\n` +
          `🌍 Dimension : **${dimension}**`
      });
    } catch (error) {
      console.error(error);
      await interaction.reply({
        content: "❌ Erreur lors de l'enregistrement du lieu.",
        ephemeral: true
      });
    }
  }
};