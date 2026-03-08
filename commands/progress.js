const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const Groq = require("groq-sdk");

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

async function askQuestion(interaction, content, time = 300000) {
  const questionMessage = await interaction.channel.send(content);

  const filter = message =>
    message.author.id === interaction.user.id &&
    message.channel.id === interaction.channel.id;

  try {
    const collected = await interaction.channel.awaitMessages({
      filter,
      max: 1,
      time,
      errors: ["time"]
    });

    const userMessage = collected.first();

    return {
      questionMessage,
      userMessage,
      answer: userMessage.content
    };
  } catch (error) {
    try {
      await questionMessage.delete();
    } catch (_) {}

    throw new Error("TIMEOUT");
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("progress")
    .setDescription("Analyse votre progression Minecraft avec questions intelligentes"),

  async execute(interaction) {
    await interaction.reply({
      content: "📈 Analyse de progression lancée... regarde le salon.",
      flags: MessageFlags.Ephemeral
    });

    const messagesToDelete = [];

    try {
      const step1 = await askQuestion(
        interaction,
        "📌 **Décris-moi où vous en êtes sur le serveur Minecraft.**\n" +
          "Exemple : base, villageois, Nether, farms, End, stuff, etc.\n\n" +
          "Tu as **5 minutes** pour répondre."
      );

      messagesToDelete.push(step1.questionMessage, step1.userMessage);

      const followupGen = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content:
              "Tu es un expert Minecraft Java vanilla. " +
              "À partir d'une description d'avancement d'un serveur entre amis, " +
              "tu dois poser exactement 2 questions de suivi très utiles et précises. " +
              "Ces questions doivent aider à mieux évaluer la progression réelle du serveur. " +
              "Les questions doivent être courtes, concrètes, pertinentes. " +
              'Réponds STRICTEMENT au format JSON suivant : {"q1":"...","q2":"..."}'
          },
          {
            role: "user",
            content: `Voici la description actuelle du serveur : ${step1.answer}`
          }
        ],
        temperature: 0.4,
        max_tokens: 180
      });

      const rawQuestions =
        followupGen.choices?.[0]?.message?.content?.trim() || "";

      let q1 = "Avez-vous déjà trouvé une forteresse du Nether ou localisé l'End ?";
      let q2 = "Quelles farms ou ressources automatiques avez-vous déjà mises en place ?";

      try {
        const parsed = JSON.parse(rawQuestions);
        if (parsed.q1 && parsed.q2) {
          q1 = parsed.q1;
          q2 = parsed.q2;
        }
      } catch (_) {}

      const step2 = await askQuestion(
        interaction,
        `❓ **Question 1 :** ${q1}\n\nTu as **5 minutes** pour répondre.`
      );
      messagesToDelete.push(step2.questionMessage, step2.userMessage);

      const step3 = await askQuestion(
        interaction,
        `❓ **Question 2 :** ${q2}\n\nTu as **5 minutes** pour répondre.`
      );
      messagesToDelete.push(step3.questionMessage, step3.userMessage);

      const loadingMessage = await interaction.channel.send(
        "🧠 J'analyse toutes vos réponses..."
      );
      messagesToDelete.push(loadingMessage);

      const finalCompletion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content:
              "Tu es un expert Minecraft Java vanilla. " +
              "Tu aides un petit serveur entre amis à comprendre sa progression. " +
              "Réponds uniquement en français. " +
              "Analyse les réponses et produis une réponse utile, structurée, concrète. " +
              "Format obligatoire :\n" +
              "1. Situation actuelle\n" +
              "2. Ce qu'il manque encore\n" +
              "3. 3 prochaines priorités\n" +
              "4. Objectif conseillé pour la prochaine session\n" +
              "Reste centré sur survival vanilla Java."
          },
          {
            role: "user",
            content:
              `Réponse initiale : ${step1.answer}\n\n` +
              `Réponse à la question 1 (${q1}) : ${step2.answer}\n\n` +
              `Réponse à la question 2 (${q2}) : ${step3.answer}`
          }
        ],
        temperature: 0.6,
        max_tokens: 500
      });

      const finalAnswer =
        finalCompletion.choices?.[0]?.message?.content?.trim() ||
        "Je n'ai pas réussi à analyser correctement votre progression.";

      for (const msg of messagesToDelete) {
        if (!msg) continue;
        try {
          await msg.delete();
        } catch (_) {}
      }

      await interaction.channel.send(`📈 **Analyse de progression**\n\n${finalAnswer}`);
    } catch (error) {
      console.error("Erreur /progress :", error);

      for (const msg of messagesToDelete) {
        if (!msg) continue;
        try {
          await msg.delete();
        } catch (_) {}
      }

      if (error.message === "TIMEOUT") {
        await interaction.channel.send(
          `⌛ ${interaction.user}, temps écoulé. Relance **/progress** quand tu veux.`
        );
        return;
      }

      await interaction.channel.send(
        `❌ ${interaction.user}, une erreur est survenue pendant l'analyse de progression.`
      );
    }
  }
};