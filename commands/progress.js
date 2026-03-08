const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const Groq = require("groq-sdk");
const { run } = require("../db");

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
  } catch (_) {
    try {
      await questionMessage.delete();
    } catch (_) {}

    throw new Error("TIMEOUT");
  }
}

function safeParseProgressPayload(raw) {
  try {
    const cleaned = raw.trim();
    return JSON.parse(cleaned);
  } catch (_) {
    return null;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("progress")
    .setDescription("Analyse votre progression Minecraft et met à jour la mémoire du serveur"),

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
          "Par exemple : base, stuff, villageois, Nether, forteresse, End, farms, dragon, etc.\n\n" +
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
              "À partir d'une description de progression d'un serveur entre amis, " +
              "tu dois poser exactement 2 questions de suivi très pertinentes. " +
              'Réponds STRICTEMENT en JSON au format {"q1":"...","q2":"..."}.'
          },
          {
            role: "user",
            content: `Description actuelle du serveur : ${step1.answer}`
          }
        ],
        temperature: 0.4,
        max_tokens: 180
      });

      let q1 = "Avez-vous déjà trouvé une forteresse du Nether ?";
      let q2 = "Quelles farms ou grosses ressources automatiques avez-vous déjà ?";

      const rawQuestions =
        followupGen.choices?.[0]?.message?.content?.trim() || "";

      try {
        const parsed = JSON.parse(rawQuestions);
        if (parsed.q1) q1 = parsed.q1;
        if (parsed.q2) q2 = parsed.q2;
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
        "🧠 J'analyse vos réponses et je mets la mémoire à jour..."
      );
      messagesToDelete.push(loadingMessage);

      const finalCompletion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content:
              "Tu es un expert Minecraft Java vanilla. " +
              "Tu analyses la progression d'un petit serveur entre amis. " +
              "Tu dois répondre STRICTEMENT en JSON valide, sans texte avant ni après. " +
              "Format obligatoire : " +
              '{' +
              '"discord_reply":"...",' +
              '"memory":{' +
              '"stage":"debut|milieu|nether|end|late",' +
              '"has_nether":true,' +
              '"has_fortress":false,' +
              '"has_end_access":false,' +
              '"killed_dragon":false,' +
              '"farms":[{"name":"iron farm","status":"done"}],' +
              '"notes":"...",' +
              '"last_progress_summary":"..."' +
              "}" +
              "}. " +
              "Le champ discord_reply doit contenir : " +
              "1. Situation actuelle " +
              "2. Ce qu'il manque encore " +
              "3. 3 prochaines priorités " +
              "4. Objectif conseillé pour la prochaine session."
          },
          {
            role: "user",
            content:
              `Réponse initiale : ${step1.answer}\n\n` +
              `Réponse à la question 1 (${q1}) : ${step2.answer}\n\n` +
              `Réponse à la question 2 (${q2}) : ${step3.answer}`
          }
        ],
        temperature: 0.5,
        max_tokens: 900
      });

      const rawFinal =
        finalCompletion.choices?.[0]?.message?.content?.trim() || "";

      const parsed = safeParseProgressPayload(rawFinal);

      if (!parsed || !parsed.memory || !parsed.discord_reply) {
        throw new Error("INVALID_PROGRESS_JSON");
      }

      const memory = parsed.memory;

      const farms = Array.isArray(memory.farms) ? memory.farms : [];

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
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(guild_id)
        DO UPDATE SET
          stage = excluded.stage,
          has_nether = excluded.has_nether,
          has_fortress = excluded.has_fortress,
          has_end_access = excluded.has_end_access,
          killed_dragon = excluded.killed_dragon,
          farms = excluded.farms,
          notes = excluded.notes,
          last_progress_summary = excluded.last_progress_summary,
          updated_at = CURRENT_TIMESTAMP
        `,
        [
          interaction.guildId,
          memory.stage || "debut",
          memory.has_nether ? 1 : 0,
          memory.has_fortress ? 1 : 0,
          memory.has_end_access ? 1 : 0,
          memory.killed_dragon ? 1 : 0,
          JSON.stringify(farms),
          memory.notes || "",
          memory.last_progress_summary || ""
        ]
      );

      for (const msg of messagesToDelete) {
        if (!msg) continue;
        try {
          await msg.delete();
        } catch (_) {}
      }

      await interaction.channel.send(
        `📈 **Analyse de progression**\n\n${parsed.discord_reply}`
      );
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