const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const Groq = require("groq-sdk");
const { run, get } = require("../db");

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

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw.trim());
  } catch (_) {
    return null;
  }
}

function formatExistingMemory(row) {
  if (!row) {
    return "Aucune mémoire actuelle enregistrée.";
  }

  let farms = [];
  try {
    farms = JSON.parse(row.farms || "[]");
  } catch (_) {
    farms = [];
  }

  const farmsText = farms.length
    ? farms.map(f => `${f.name} (${f.status})`).join(", ")
    : "aucune";

  return [
    `Stage: ${row.stage || "debut"}`,
    `Nether atteint: ${row.has_nether ? "oui" : "non"}`,
    `Forteresse trouvée: ${row.has_fortress ? "oui" : "non"}`,
    `End accessible: ${row.has_end_access ? "oui" : "non"}`,
    `Dragon tué: ${row.killed_dragon ? "oui" : "non"}`,
    `Farms: ${farmsText}`,
    `Notes: ${row.notes || "aucune"}`,
    `Dernier résumé: ${row.last_progress_summary || "aucun"}`
  ].join("\n");
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
      const existingMemory = await get(
        `SELECT * FROM server_memory WHERE guild_id = ?`,
        [interaction.guildId]
      );

      const existingMemoryText = formatExistingMemory(existingMemory);

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
              "Tu es un expert Minecraft Java vanilla très expérimenté. " +
              "Tu aides un petit serveur entre amis à évaluer sa progression réelle. " +
              "À partir de la description du joueur et de la mémoire existante, " +
              "pose exactement 2 questions de suivi très ciblées, non génériques, " +
              "qui vont vraiment aider à mieux comprendre ce qu'il leur manque ensuite. " +
              "Évite les questions trop larges. " +
              'Réponds STRICTEMENT en JSON : {"q1":"...","q2":"..."}'
          },
          {
            role: "user",
            content:
              `Mémoire actuelle du serveur :\n${existingMemoryText}\n\n` +
              `Nouvelle description du joueur :\n${step1.answer}`
          }
        ],
        temperature: 0.5,
        max_tokens: 220
      });

      let q1 = "Avez-vous déjà trouvé une forteresse du Nether et récupéré des blaze rods ?";
      let q2 = "Quelles farms vraiment utiles avez-vous déjà terminées ou presque terminées ?";

      const rawQuestions =
        followupGen.choices?.[0]?.message?.content?.trim() || "";

      try {
        const parsedQuestions = JSON.parse(rawQuestions);
        if (parsedQuestions.q1) q1 = parsedQuestions.q1;
        if (parsedQuestions.q2) q2 = parsedQuestions.q2;
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

      // 1) Analyse libre pour avoir une meilleure réponse Discord
      const analysisCompletion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content:
              "Tu es un expert Minecraft Java vanilla très expérimenté. " +
              "Tu aides un petit serveur entre amis à comprendre sa progression réelle. " +
              "Tu réponds uniquement en français. " +
              "Tu dois produire une analyse utile, concrète, pertinente et pas générique. " +
              "Appuie-toi sur la mémoire existante et sur les réponses du joueur. " +
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
              `Mémoire actuelle du serveur :\n${existingMemoryText}\n\n` +
              `Réponse initiale : ${step1.answer}\n\n` +
              `Réponse à la question 1 (${q1}) : ${step2.answer}\n\n` +
              `Réponse à la question 2 (${q2}) : ${step3.answer}`
          }
        ],
        temperature: 0.6,
        max_tokens: 700
      });

      const discordReply =
        analysisCompletion.choices?.[0]?.message?.content?.trim() ||
        "Je n'ai pas réussi à analyser correctement votre progression.";

      // 2) Extraction mémoire séparée pour garder une bonne qualité
      const memoryCompletion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content:
              "Tu extrais une mémoire structurée d'un serveur Minecraft Java vanilla. " +
              "Tu dois répondre STRICTEMENT en JSON valide, sans texte avant ni après. " +
              "Format obligatoire : " +
              '{' +
              '"stage":"debut|milieu|nether|end|late",' +
              '"has_nether":true,' +
              '"has_fortress":false,' +
              '"has_end_access":false,' +
              '"killed_dragon":false,' +
              '"farms":[{"name":"iron farm","status":"done|building|planned"}],' +
              '"notes":"...",' +
              '"last_progress_summary":"..."' +
              "}. " +
              "Le champ notes doit être court et utile. " +
              "Le champ last_progress_summary doit résumer clairement l'état du serveur en 1 ou 2 phrases."
          },
          {
            role: "user",
            content:
              `Mémoire actuelle du serveur :\n${existingMemoryText}\n\n` +
              `Réponse initiale : ${step1.answer}\n\n` +
              `Réponse à la question 1 (${q1}) : ${step2.answer}\n\n` +
              `Réponse à la question 2 (${q2}) : ${step3.answer}\n\n` +
              `Analyse finale produite :\n${discordReply}`
          }
        ],
        temperature: 0.2,
        max_tokens: 500
      });

      const rawMemory =
        memoryCompletion.choices?.[0]?.message?.content?.trim() || "";

      const memory = safeJsonParse(rawMemory);

      if (!memory) {
        throw new Error("INVALID_MEMORY_JSON");
      }

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
        `📈 **Analyse de progression**\n\n${discordReply}`
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