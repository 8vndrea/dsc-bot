const { SlashCommandBuilder } = require("discord.js");
const Groq = require("groq-sdk");

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

module.exports = {
  data: new SlashCommandBuilder()
    .setName("craft")
    .setDescription("Demande comment crafter un objet Minecraft")
    .addStringOption(option =>
      option
        .setName("objet")
        .setDescription("Objet Minecraft")
        .setRequired(true)
    ),

  async execute(interaction) {
    const item = interaction.options.getString("objet");

    await interaction.deferReply();

    try {
      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content:
              "Tu expliques uniquement comment crafter des objets dans Minecraft Java vanilla. Réponse courte et claire."
          },
          {
            role: "user",
            content: `Comment crafter ${item} dans Minecraft ?`
          }
        ]
      });

      const answer = completion.choices[0].message.content;

      await interaction.editReply(
        `🛠 **Recette Minecraft : ${item}**\n\n${answer}`
      );

    } catch (error) {
      console.error(error);
      await interaction.editReply("❌ Erreur avec l'IA.");
    }
  }
};