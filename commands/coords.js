const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("coords")
    .setDescription("Convertit des coordonnées entre Overworld et Nether")
    .addIntegerOption(option =>
      option.setName("x").setDescription("Coordonnée X").setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName("z").setDescription("Coordonnée Z").setRequired(true)
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

    let newX;
    let newZ;
    let target;

    if (dimension === "overworld") {
      newX = Math.round(x / 8);
      newZ = Math.round(z / 8);
      target = "Nether";
    } else {
      newX = x * 8;
      newZ = z * 8;
      target = "Overworld";
    }

    await interaction.reply(
      `📍 **Conversion de coordonnées**\n\n` +
      `X: **${x}** Z: **${z}** → **${target}**\n\n` +
      `➡️ X: **${newX}** Z: **${newZ}**`
    );
  }
};