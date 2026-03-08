const { SlashCommandBuilder } = require("discord.js");
const Groq = require("groq-sdk");

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

module.exports = {
  data: new SlashCommandBuilder()
    .setName("farmidea")
    .setDescription("Propose 3 idées de farms Minecraft")
    .addStringOption(option =>
      option
        .setName("besoin")
        .setDescription("Ce dont tu as besoin")
        .addChoices(
          { name: "Bouffe", value: "bouffe" },
          { name: "XP", value: "xp" },
          { name: "Fer", value: "fer" },
          { name: "Redstone", value: "redstone" },
          { name: "Émeraudes", value: "emeraudes" },
          { name: "Poudre à canon", value: "poudre_a_canon" },
          { name: "Mob drops", value: "mob_drops" },
          { name: "Canne à sucre", value: "canne_a_sucre" },
          { name: "Bois", value: "bois" }
        )
    )
    .addStringOption(option =>
      option
        .setName("niveau")
        .setDescription("Niveau de progression")
        .addChoices(
          { name: "Début de partie", value: "debut" },
          { name: "Milieu de partie", value: "milieu" },
          { name: "Fin de partie", value: "fin" }
        )
    ),

  async execute(interaction) {
    const besoin = interaction.options.getString("besoin") || "utile";
    const niveau = interaction.options.getString("niveau") || "milieu";

    await interaction.deferReply();

    try {
      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content:
              "Tu es un expert Minecraft Java vanilla. " +
              "Tu aides un petit serveur entre amis. " +
              "Tu réponds uniquement en français. " +
              "Tu proposes exactement 3 idées de farms adaptées au besoin demandé. " +
              "Pour chaque idée, donne : 1) Nom, 2) Utilité, 3) Difficulté, 4) Ressources de base. " +
              "Réponse courte, concrète, bien séparée, sans blabla inutile. " +
              "Reste en survival vanilla Java."
          },
          {
            role: "user",
            content:
              `Propose exactement 3 idées de farms Minecraft pour un serveur entre amis. ` +
              `Besoin principal : ${besoin}. ` +
              `Niveau de progression : ${niveau}.`
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      });

      const answer =
        completion.choices?.[0]?.message?.content?.trim() ||
        "Je n'ai pas réussi à proposer des idées de farms.";

      await interaction.editReply(`🌾 **3 idées de farms**\n\n${answer}`);
    } catch (error) {
      console.error("Erreur Groq:", error);

      let message = "❌ Erreur avec l'IA.";

      if (error?.status === 401) {
        message = "❌ Clé API Groq invalide ou manquante.";
      } else if (error?.status === 429) {
        message = "❌ Limite Groq atteinte. Réessaie un peu plus tard.";
      }

      await interaction.editReply(message);
    }
  }
};