const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("nextportal")
    .setDescription("Calcule les coordonnées du portail lié entre Overworld et Nether")
    .addIntegerOption(option =>
      option
        .setName("x")
        .setDescription("Coordonnée X actuelle")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("z")
        .setDescription("Coordonnée Z actuelle")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("dimension")
        .setDescription("Dimension actuelle")
        .setRequired(true)
        .addChoices(
          { name: "Overworld → Nether", value: "overworld" },
          { name: "Nether → Overworld", value: "nether" }
        )
    ),

  async execute(interaction) {
    const x = interaction.options.getInteger("x");
    const z = interaction.options.getInteger("z");
    const dimension = interaction.options.getString("dimension");

    let targetX;
    let targetZ;
    let fromName;
    let toName;

    if (dimension === "overworld") {
      targetX = Math.round(x / 8);
      targetZ = Math.round(z / 8);
      fromName = "Overworld";
      toName = "Nether";
    } else {
      targetX = x * 8;
      targetZ = z * 8;
      fromName = "Nether";
      toName = "Overworld";
    }

    await interaction.reply({
      content:
        `🌀 **Portail lié**\n\n` +
        `**Depuis :** ${fromName}\n` +
        `📍 Coordonnées actuelles : X: **${x}** | Z: **${z}**\n\n` +
        `**Vers :** ${toName}\n` +
        `📍 Coordonnées conseillées : X: **${targetX}** | Z: **${targetZ}**\n\n` +
        `💡 Astuce : construis le portail au plus proche de ces coordonnées pour maximiser les chances de bon lien.`
    });
  }
};