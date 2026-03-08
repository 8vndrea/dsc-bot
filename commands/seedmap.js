const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("seedmap")
    .setDescription("Génère une map interactive du seed")
    .addStringOption(option =>
      option
        .setName("seed")
        .setDescription("Seed du serveur")
        .setRequired(true)
    ),

  async execute(interaction) {
    const seed = interaction.options.getString("seed");

    const link = `https://www.chunkbase.com/apps/seed-map#${seed}`;

    await interaction.reply(
      `🗺 **Map interactive du seed**\n\n` +
      `Seed : **${seed}**\n` +
      `➡️ ${link}`
    );
  }
};