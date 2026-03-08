const { SlashCommandBuilder } = require("discord.js");
const Groq = require("groq-sdk");

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

module.exports = {
  data: new SlashCommandBuilder()
    .setName("objective")
    .setDescription("Donne un objectif pour la session Minecraft")
    .addStringOption(option =>
      option
        .setName("type")
        .setDescription("Type d'objectif")
        .addChoices(
          { name: "Progression", value: "progression" },
          { name: "Construction", value: "construction" },
          { name: "Exploration", value: "exploration" },
          { name: "Farm", value: "farm" }
        )
    ),

  async execute(interaction) {
    const type = interaction.options.getString("type") || "session";

    await interaction.deferReply();

    try {
      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content:
              "Tu proposes des objectifs Minecraft Java vanilla pour un petit serveur entre amis. Réponse courte."
          },
          {
            role: "user",
            content: `Donne un objectif ${type} pour une session Minecraft entre amis.`
          }
        ],
        temperature: 0.7
      });

      const answer = completion.choices[0].message.content;

      await interaction.editReply(
        `🎯 **Objectif proposé**\n\n${answer}`
      );

    } catch (error) {
      console.error(error);
      await interaction.editReply("❌ Erreur avec l'IA.");
    }
  }
};