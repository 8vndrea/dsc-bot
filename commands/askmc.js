const { SlashCommandBuilder } = require("discord.js");
const Groq = require("groq-sdk");
const { get, all, run } = require("../db");

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
    `Dernier résumé : ${memoryRow.last_progress_summary || "aucun"}`
  ].join("\n");
}

function formatConversationHistory(rows) {
  if (!rows.length) {
    return "Aucun historique récent.";
  }

  return rows
    .map(row => {
      const role = row.role === "assistant" ? "Assistant" : "User";
      return `${role}: ${row.content}`;
    })
    .join("\n");
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

async function trimConversationMemory(guildId, channelId, maxMessages = 12) {
  const rows = await all(
    `
    SELECT id
    FROM conversation_memory
    WHERE guild_id = ? AND channel_id = ?
    ORDER BY created_at DESC, id DESC
    `,
    [guildId, channelId]
  );

  if (rows.length <= maxMessages) return;

  const idsToDelete = rows.slice(maxMessages).map(r => r.id);
  const placeholders = idsToDelete.map(() => "?").join(",");

  await run(
    `DELETE FROM conversation_memory WHERE id IN (${placeholders})`,
    idsToDelete
  );
}

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
    const guildId = interaction.guildId;
    const channelId = interaction.channelId;
    const question = interaction.options.getString("question");

    await interaction.deferReply();

    try {
      const serverMemory = await get(
        `SELECT * FROM server_memory WHERE guild_id = ?`,
        [guildId]
      );

      const historyRows = await all(
        `
        SELECT role, content
        FROM conversation_memory
        WHERE guild_id = ? AND channel_id = ?
        ORDER BY created_at ASC, id ASC
        LIMIT 12
        `,
        [guildId, channelId]
      );

      const memoryText = formatServerMemory(serverMemory);
      const historyText = formatConversationHistory(historyRows);

      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content:
              "Tu es un assistant expert Minecraft Java vanilla pour un petit serveur entre amis. " +
              "Tu réponds uniquement en français. " +
              "Tu prends en compte la mémoire longue du serveur et l'historique récent du salon. " +
              "Tu donnes des réponses concrètes, utiles, assez courtes. " +
              "Tu n'inventes pas. " +
              "Si une information dépend d'une version précise ou est incertaine, dis-le honnêtement. " +
              "Quand l'utilisateur rebondit sur une question précédente, utilise l'historique pour comprendre le contexte. " +
              "Reste centré sur survival vanilla Java sauf si l'utilisateur demande autre chose."
          },
          {
            role: "system",
            content:
              `Mémoire longue du serveur :\n${memoryText}\n\n` +
              `Historique récent du salon :\n${historyText}`
          },
          {
            role: "user",
            content: question
          }
        ],
        temperature: 0.4,
        max_tokens: 450
      });

      const answer =
        completion.choices?.[0]?.message?.content?.trim() ||
        "Je n'ai pas réussi à générer une réponse.";

      await run(
        `
        INSERT INTO conversation_memory (guild_id, channel_id, role, content)
        VALUES (?, ?, 'user', ?)
        `,
        [guildId, channelId, question]
      );

      await run(
        `
        INSERT INTO conversation_memory (guild_id, channel_id, role, content)
        VALUES (?, ?, 'assistant', ?)
        `,
        [guildId, channelId, answer]
      );

      await trimConversationMemory(guildId, channelId, 12);

      const fullReply = `❓ **Question :** ${question}\n\n🧠 **Réponse :** ${answer}`;
      const parts = splitMessage(fullReply);

      await interaction.editReply(parts[0]);

      for (let i = 1; i < parts.length; i++) {
        await interaction.followUp(parts[i]);
      }
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