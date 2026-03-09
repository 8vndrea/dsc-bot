const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const Groq = require("groq-sdk");
const { get, run } = require("../db");

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

function formatServerMemory(memoryRow) {
  if (!memoryRow) {
    return "Aucune mémoire longue enregistrée pour ce serveur.";
  }

  let farms = [];
  try {
    farms = JSON.parse(memoryRow.farms || "[]");
  } catch (_) {
    farms = [];
  }

  const farmsText = farms.length
    ? farms.map(f => `${f.name} (${f.status})`).join(", ")
    : "aucune farm mémorisée";

  return [
    `Stage : ${memoryRow.stage || "debut"}`,
    `Nether atteint : ${memoryRow.has_nether ? "oui" : "non"}`,
    `Forteresse trouvée : ${memoryRow.has_fortress ? "oui" : "non"}`,
    `End accessible : ${memoryRow.has_end_access ? "oui" : "non"}`,
    `Dragon tué : ${memoryRow.killed_dragon ? "oui" : "non"}`,
    `Farms : ${farmsText}`,
    `Notes : ${memoryRow.notes || "aucune note"}`,
    `Dernier résumé : ${memoryRow.last_progress_summary || "aucun"}`,
    `Dernier objectif : ${memoryRow.last_objective || "aucun"}`
  ].join("\n");
}

function isMemoryTooWeak(memoryRow) {
  if (!memoryRow) return true;

  const hasUsefulNotes =
    (memoryRow.notes && memoryRow.notes.trim().length > 20) ||
    (memoryRow.last_progress_summary &&
      memoryRow.last_progress_summary.trim().length > 20);

  const hasKnownStage =
    memoryRow.stage &&
    ["debut", "milieu", "nether", "end", "late"].includes(memoryRow.stage);

  return !hasUsefulNotes && !hasKnownStage;
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
    .setName("objective")
    .setDescription("Propose un objectif précis pour votre prochaine session Minecraft")
    .addStringOption(option =>
      option
        .setName("type")
        .setDescription("Type d'objectif")
        .addChoices(
          { name: "Auto", value: "auto" },
          { name: "Progression", value: "progression" },
          { name: "Construction", value: "construction" },
          { name: "Exploration", value: "exploration" },
          { name: "Farm", value: "farm" }
        )
    ),

  async execute(interaction) {
    const type = interaction.options.getString("type") || "auto";
    const messagesToDelete = [];

    await interaction.reply({
      content: "🎯 Je prépare un objectif de session...",
      flags: MessageFlags.Ephemeral
    });

    try {
      const serverMemory = await get(
        `SELECT * FROM server_memory WHERE guild_id = ?`,
        [interaction.guildId]
      );

      const memoryText = formatServerMemory(serverMemory);

      let extraContext = "";

      if (isMemoryTooWeak(serverMemory)) {
        const step = await askQuestion(
          interaction,
          "❓ **J'ai besoin d'une petite précision avant de proposer un objectif.**\n" +
            "Décris en **une phrase** où vous en êtes en ce moment sur le serveur.\n\n" +
            "Tu as **5 minutes** pour répondre."
        );

        messagesToDelete.push(step.questionMessage, step.userMessage);
        extraContext = step.answer;
      }

      const loadingMessage = await interaction.channel.send(
        "🧠 Je cherche l'objectif le plus logique pour votre prochaine session..."
      );
      messagesToDelete.push(loadingMessage);

      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content:
              "Tu es un expert Minecraft Java vanilla pour un petit serveur entre amis. " +
              "Tu proposes un seul objectif de session, très précis, vraiment adapté à la progression actuelle. " +
              "Tu t'appuies d'abord sur la mémoire du serveur. " +
              "Si un type d'objectif est fourni, respecte-le. " +
              "Évite de reproposer exactement le dernier objectif si un autre objectif pertinent existe. " +
              "Réponds uniquement en français. " +
              "Sois concret et utile, pas générique. " +
              "Format obligatoire :\n" +
              "1. Objectif principal\n" +
              "2. Pourquoi c'est le bon objectif maintenant\n" +
              "3. Étapes rapides\n" +
              "4. Récompense / bénéfice attendu\n" +
              "La réponse doit rester courte à moyenne, adaptée à Discord, et faire moins de 1400 caractères."
          },
          {
            role: "user",
            content:
              `Type demandé : ${type}\n\n` +
              `Mémoire actuelle du serveur :\n${memoryText}\n\n` +
              `Précision supplémentaire éventuelle : ${extraContext || "aucune"}`
          }
        ],
        temperature: 0.6,
        max_tokens: 500
      });

      const answer =
        completion.choices?.[0]?.message?.content?.trim() ||
        "Je n'ai pas réussi à proposer un objectif utile.";

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
        VALUES (?, 'debut', 0, 0, 0, 0, '[]', '', '', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(guild_id)
        DO UPDATE SET
          last_objective = excluded.last_objective,
          updated_at = CURRENT_TIMESTAMP
        `,
        [interaction.guildId, answer]
      );

      for (const msg of messagesToDelete) {
        if (!msg) continue;
        try {
          await msg.delete();
        } catch (_) {}
      }

      const parts = splitMessage(`🎯 **Objectif proposé**\n\n${answer}`);

      await interaction.channel.send(parts[0]);
      for (let i = 1; i < parts.length; i++) {
        await interaction.channel.send(parts[i]);
      }
    } catch (error) {
      console.error("Erreur /objective :", error);

      for (const msg of messagesToDelete) {
        if (!msg) continue;
        try {
          await msg.delete();
        } catch (_) {}
      }

      if (error.message === "TIMEOUT") {
        await interaction.channel.send(
          `⌛ ${interaction.user}, temps écoulé. Relance **/objective** quand tu veux.`
        );
        return;
      }

      await interaction.channel.send(
        `❌ ${interaction.user}, une erreur est survenue pendant la génération de l'objectif.`
      );
    }
  }
};