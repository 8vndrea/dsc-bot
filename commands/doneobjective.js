const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const Groq = require("groq-sdk");
const { get, run } = require("../db");

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw.trim());
  } catch (_) {
    return null;
  }
}

function splitMessage(text, maxLength = 1900) {
  const chunks = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    let slice = remaining.slice(0, maxLength);

    const lastBreak = Math.max(
      slice.lastIndexOf("\n"),
      slice.lastIndexOf(". "),
      slice.lastIndexOf("! "),
      slice.lastIndexOf("? ")
    );

    if (lastBreak > 200) {
      slice = remaining.slice(0, lastBreak + 1);
    }

    chunks.push(slice.trim());
    remaining = remaining.slice(slice.length).trim();
  }

  if (remaining.length) {
    chunks.push(remaining);
  }

  return chunks;
}

function formatServerMemory(row) {
  if (!row) {
    return "Aucune mémoire longue enregistrée pour ce serveur.";
  }

  let farms = [];
  try {
    farms = JSON.parse(row.farms || "[]");
  } catch (_) {
    farms = [];
  }

  const farmsText = farms.length
    ? farms.map(f => `${f.name} (${f.status})`).join(", ")
    : "aucune farm mémorisée";

  return [
    `Stage : ${row.stage || "debut"}`,
    `Nether atteint : ${row.has_nether ? "oui" : "non"}`,
    `Forteresse trouvée : ${row.has_fortress ? "oui" : "non"}`,
    `End accessible : ${row.has_end_access ? "oui" : "non"}`,
    `Dragon tué : ${row.killed_dragon ? "oui" : "non"}`,
    `Farms : ${farmsText}`,
    `Notes : ${row.notes || "aucune note"}`,
    `Dernier résumé : ${row.last_progress_summary || "aucun"}`,
    `Dernier objectif : ${row.last_objective || "aucun"}`
  ].join("\n");
}

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

module.exports = {
  data: new SlashCommandBuilder()
    .setName("doneobjective")
    .setDescription("Met à jour la progression après des objectifs réalisés et propose la suite"),

  async execute(interaction) {
    await interaction.reply({
      content: "✅ Mise à jour de progression lancée... regarde le salon.",
      flags: MessageFlags.Ephemeral
    });

    const messagesToDelete = [];

    try {
      const serverMemory = await get(
        `SELECT * FROM server_memory WHERE guild_id = ?`,
        [interaction.guildId]
      );

      const memoryText = formatServerMemory(serverMemory);

      const promptText =
        "✅ **Quels objectifs précis avez-vous réalisés depuis la dernière fois ?**\n\n" +
        `**Dernier objectif connu :** ${serverMemory?.last_objective || "aucun"}\n\n` +
        `**Dernier résumé connu :** ${serverMemory?.last_progress_summary || "aucun"}\n\n` +
        "Réponds librement, par exemple :\n" +
        "- on a trouvé une forteresse\n" +
        "- on a fini la ferme à fer\n" +
        "- on a tué le dragon\n" +
        "- on a juste avancé la salle d'enchantement\n\n" +
        "Tu as **5 minutes** pour répondre.";

      const step1 = await askQuestion(interaction, promptText);
      messagesToDelete.push(step1.questionMessage, step1.userMessage);

      const loadingMessage = await interaction.channel.send(
        "🧠 J'analyse ce qui a été terminé, je mets la mémoire à jour, puis je prépare la suite..."
      );
      messagesToDelete.push(loadingMessage);

      // 1) Analyse libre, utile, lisible
      const analysisCompletion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content:
              "Tu es un expert Minecraft Java vanilla pour un petit serveur entre amis. " +
              "Tu analyses ce qui a été accompli depuis les derniers objectifs. " +
              "Tu félicites brièvement, tu mets à jour mentalement la progression, " +
              "puis tu proposes la suite la plus logique. " +
              "Réponds uniquement en français. " +
              "Sois concret, utile et pas générique. " +
              "Format obligatoire :\n" +
              "1. Bravo / ce qui a été accompli\n" +
              "2. Ce que ça change dans la progression\n" +
              "3. 3 nouveaux objectifs conseillés\n" +
              "4. Prochaine priorité immédiate\n" +
              "Réponse courte à moyenne, moins de 1400 caractères."
          },
          {
            role: "user",
            content:
              `Mémoire actuelle du serveur :\n${memoryText}\n\n` +
              `Nouvelles informations du joueur :\n${step1.answer}`
          }
        ],
        temperature: 0.6,
        max_tokens: 650
      });

      const discordReply =
        analysisCompletion.choices?.[0]?.message?.content?.trim() ||
        "Bravo pour votre avancée. Je n'ai pas réussi à analyser correctement la suite.";

      // 2) Extraction mémoire séparée
      const memoryCompletion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content:
              "Tu mets à jour la mémoire structurée d'un serveur Minecraft Java vanilla. " +
              "Tu dois remplacer les informations obsolètes par les nouvelles. " +
              "Si un objectif a été réalisé, il ne doit plus être considéré comme l'objectif courant. " +
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
              '"last_progress_summary":"...",' +
              '"last_objective":"..."' +
              "}. " +
              "Le champ last_objective doit contenir le prochain objectif principal conseillé, pas l'ancien. " +
              "Le champ notes doit être court et à jour. " +
              "Le champ last_progress_summary doit résumer l'état actuel du serveur après les objectifs réalisés."
          },
          {
            role: "user",
            content:
              `Mémoire actuelle du serveur :\n${memoryText}\n\n` +
              `Objectifs réalisés / nouvelles infos :\n${step1.answer}\n\n` +
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
          last_objective,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
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
          last_objective = excluded.last_objective,
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
          memory.last_progress_summary || "",
          memory.last_objective || ""
        ]
      );

      for (const msg of messagesToDelete) {
        if (!msg) continue;
        try {
          await msg.delete();
        } catch (_) {}
      }

      const parts = splitMessage(`🎉 **Mise à jour de progression**\n\n${discordReply}`);

      await interaction.channel.send(parts[0]);
      for (let i = 1; i < parts.length; i++) {
        await interaction.channel.send(parts[i]);
      }
    } catch (error) {
      console.error("Erreur /doneobjective :", error);

      for (const msg of messagesToDelete) {
        if (!msg) continue;
        try {
          await msg.delete();
        } catch (_) {}
      }

      if (error.message === "TIMEOUT") {
        await interaction.channel.send(
          `⌛ ${interaction.user}, temps écoulé. Relance **/doneobjective** quand tu veux.`
        );
        return;
      }

      await interaction.channel.send(
        `❌ ${interaction.user}, une erreur est survenue pendant la mise à jour des objectifs.`
      );
    }
  }
};