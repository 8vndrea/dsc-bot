const { SlashCommandBuilder } = require("discord.js");
const Groq = require("groq-sdk");

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

module.exports = {
  data: new SlashCommandBuilder()
    .setName("askmc")
    .setDescription("Pose une question sur Minecraft Java vanilla")
    .addStringOption(option =>
      option
        .setName("question")
        .setDescription("Ta question Minecraft")
        .setRequired(true)
    ),

  async execute(interaction) {
    const question = interaction.options.getString("question");

    await interaction.deferReply();

    try {
      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content:
              "Tu es un assistant expert Minecraft Java vanilla pour un petit serveur privé. " +
              "Tu réponds uniquement en français. " +
              "Tu privilégies le survival vanilla Java. " +
              "Tu donnes des réponses claires, pratiques et assez courtes. " +
              "Tu n'inventes pas. " +
              "Si une info dépend d'une version précise, précise-le. " +
              "Évite de parler de mods, plugins, commandes admin, datapacks ou Bedrock sauf si l'utilisateur le demande."
          },
          {
            role: "user",
            content: question
          }
        ],
        temperature: 0.4,
        max_tokens: 350
      });

      const answer =
        completion.choices?.[0]?.message?.content?.trim() ||
        "Je n'ai pas réussi à générer une réponse.";

      await interaction.editReply(
        `❓ **Question :** ${question}\n\n🧠 **Réponse :** ${answer}`
      );
    } catch (error) {
      console.error("Erreur Groq:", error);

      let message = "❌ Erreur pendant l'appel à l'API Groq.";

      if (error?.status === 401) {
        message = "❌ Clé API Groq invalide ou manquante.";
      } else if (error?.status === 429) {
        message = "❌ Limite Groq atteinte. Réessaie un peu plus tard.";
      }

      await interaction.editReply(message);
    }
  }
};