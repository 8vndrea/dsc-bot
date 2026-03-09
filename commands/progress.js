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

  if (remaining.length) chunks.push(remaining);

  return chunks;
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
    `Dernier résumé: ${row.last_progress_summary || "aucun"}`,
    `Dernier objectif: ${row.last_objective || "aucun"}`
  ].join("\n");
}

function hasUsableMemory(row) {
  if (!row) return false;

  const hasText =
    (row.notes && row.notes.trim().length > 10) ||
    (row.last_progress_summary && row.last_progress_summary.trim().length > 10) ||
    (row.last_objective && row.last_objective.trim().length > 10);

  const hasFlags =
    row.has_nether ||
    row.has_fortress ||
    row.has_end_access ||
    row.killed_dragon ||
    (row.stage && row.stage !== "debut");

  return Boolean(hasText || hasFlags);
}

function normalizeYesNo(text) {
  const v = text.trim().toLowerCase();

  if (["oui", "o", "yes", "y", "ouais", "grave", "bien sur", "bien sûr"].includes(v)) {
    return "yes";
  }

  if (["non", "n", "no", "nop", "pas du tout"].includes(v)) {
    return "no";
  }

  return "unknown";
}

async function saveMemory(guildId, memory) {
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
      guildId,
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

      const memoryText = formatExistingMemory(existingMemory);
      const memoryExists = hasUsableMemory(existingMemory);

      // CAS 1 : aucune mémoire -> flow classique
      if (!memoryExists) {
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
                "À partir d'une description de progression d'un serveur entre amis, " +
                "pose exactement 2 questions de suivi très ciblées, utiles et non génériques. " +
                'Réponds STRICTEMENT en JSON : {"q1":"...","q2":"..."}.'
            },
            {
              role: "user",
              content: `Description actuelle du serveur : ${step1.answer}`
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
                "Format obligatoire :\n" +
                "1. Situation actuelle\n" +
                "2. Ce qu'il manque encore\n" +
                "3. 3 prochaines priorités\n" +
                "4. Objectif conseillé pour la prochaine session\n" +
                "Sois concis, moins de 1400 caractères."
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
          max_tokens: 700
        });

        const discordReply =
          analysisCompletion.choices?.[0]?.message?.content?.trim() ||
          "Je n'ai pas réussi à analyser correctement votre progression.";

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
                '"last_progress_summary":"...",' +
                '"last_objective":"..."' +
                "}. " +
                "Le champ last_objective doit être l'objectif principal le plus logique pour la prochaine session."
            },
            {
              role: "user",
              content:
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

        await saveMemory(interaction.guildId, memory);

        for (const msg of messagesToDelete) {
          if (!msg) continue;
          try {
            await msg.delete();
          } catch (_) {}
        }

        const parts = splitMessage(`📈 **Analyse de progression**\n\n${discordReply}`);
        for (const part of parts) {
          await interaction.channel.send(part);
        }
        return;
      }

      // CAS 2 : mémoire existante -> on demande si ça a avancé
      const step0 = await askQuestion(
        interaction,
        "📌 **Avez-vous avancé depuis la dernière fois ?**\n" +
          "Réponds simplement par **oui** ou **non**.\n\n" +
          "Tu as **5 minutes** pour répondre."
      );
      messagesToDelete.push(step0.questionMessage, step0.userMessage);

      const yesNo = normalizeYesNo(step0.answer);

      // Si non -> rappel des objectifs / priorités
      if (yesNo === "no") {
        const loadingMessage = await interaction.channel.send(
          "🧠 Je rappelle les priorités à partir de votre mémoire..."
        );
        messagesToDelete.push(loadingMessage);

        const reminderCompletion = await groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages: [
            {
              role: "system",
              content:
                "Tu es un expert Minecraft Java vanilla pour un petit serveur entre amis. " +
                "À partir de la mémoire actuelle, rappelle clairement les objectifs et priorités utiles. " +
                "Réponds uniquement en français. " +
                "Format obligatoire :\n" +
                "1. Où vous en êtes\n" +
                "2. Objectif principal à garder\n" +
                "3. 2 priorités secondaires\n" +
                "4. Pourquoi c'est toujours la meilleure direction\n" +
                "Sois concret, pas générique, moins de 1200 caractères."
            },
            {
              role: "user",
              content: `Mémoire actuelle du serveur :\n${memoryText}`
            }
          ],
          temperature: 0.4,
          max_tokens: 500
        });

        const reminder =
          reminderCompletion.choices?.[0]?.message?.content?.trim() ||
          "Je n'ai pas réussi à rappeler les objectifs actuels.";

        for (const msg of messagesToDelete) {
          if (!msg) continue;
          try {
            await msg.delete();
          } catch (_) {}
        }

        const parts = splitMessage(`📈 **Rappel de progression**\n\n${reminder}`);
        for (const part of parts) {
          await interaction.channel.send(part);
        }
        return;
      }

      // Si la réponse oui/non est ambiguë -> petite relance
      let advancementText = "";
      if (yesNo === "unknown") {
        advancementText = step0.answer;
      } else {
        const step1 = await askQuestion(
          interaction,
          "✅ **En quoi avez-vous avancé depuis la dernière fois ?**\n" +
            "Décris ce que vous avez concrètement fait : structures trouvées, farms terminées, dragon tué, stuff amélioré, etc.\n\n" +
            "Tu as **5 minutes** pour répondre."
        );
        messagesToDelete.push(step1.questionMessage, step1.userMessage);
        advancementText = step1.answer;
      }

      // Génère 2 questions de suivi précises à partir de la mémoire + avancée
      const followupGen = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content:
              "Tu es un expert Minecraft Java vanilla très expérimenté. " +
              "Le serveur a déjà une mémoire existante. " +
              "À partir de cette mémoire et des nouvelles avancées, pose exactement 2 questions de suivi très ciblées " +
              "pour clarifier ce qui a vraiment changé et ce qui manque maintenant. " +
              'Réponds STRICTEMENT en JSON : {"q1":"...","q2":"..."}.'
          },
          {
            role: "user",
            content:
              `Mémoire actuelle du serveur :\n${memoryText}\n\n` +
              `Nouvelles avancées décrites :\n${advancementText}`
          }
        ],
        temperature: 0.5,
        max_tokens: 220
      });

      let q1 = "Qu'est-ce que vous avez réellement terminé ou validé depuis la dernière fois ?";
      let q2 = "Qu'est-ce qu'il vous manque encore pour la prochaine grande étape ?";

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
        "🧠 J'analyse vos nouvelles avancées, je mets la mémoire à jour, puis je prépare la suite..."
      );
      messagesToDelete.push(loadingMessage);

      // Analyse libre
      const analysisCompletion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content:
              "Tu es un expert Minecraft Java vanilla pour un petit serveur entre amis. " +
              "Le serveur a une progression déjà suivie en mémoire. " +
              "Tu dois analyser les nouvelles avancées, féliciter brièvement, expliquer ce que ça change, " +
              "puis proposer la suite la plus logique. " +
              "Réponds uniquement en français. " +
              "Format obligatoire :\n" +
              "1. Bravo / ce qui a avancé\n" +
              "2. Ce que ça change dans la progression\n" +
              "3. 3 nouvelles priorités\n" +
              "4. Objectif conseillé pour la prochaine session\n" +
              "Réponse concrète, utile, moins de 1400 caractères."
          },
          {
            role: "user",
            content:
              `Mémoire actuelle du serveur :\n${memoryText}\n\n` +
              `Avancées décrites : ${advancementText}\n\n` +
              `Réponse à la question 1 (${q1}) : ${step2.answer}\n\n` +
              `Réponse à la question 2 (${q2}) : ${step3.answer}`
          }
        ],
        temperature: 0.6,
        max_tokens: 700
      });

      const discordReply =
        analysisCompletion.choices?.[0]?.message?.content?.trim() ||
        "Je n'ai pas réussi à analyser correctement vos nouvelles avancées.";

      // Extraction mémoire en remplaçant les données obsolètes
      const memoryCompletion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content:
              "Tu mets à jour la mémoire structurée d'un serveur Minecraft Java vanilla. " +
              "Tu dois remplacer les informations obsolètes par les nouvelles. " +
              "Tu réponds STRICTEMENT en JSON valide, sans texte avant ni après. " +
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
              "Le champ last_objective doit contenir le prochain objectif principal conseillé, pas l'ancien."
          },
          {
            role: "user",
            content:
              `Ancienne mémoire :\n${memoryText}\n\n` +
              `Avancées décrites : ${advancementText}\n\n` +
              `Réponse à la question 1 (${q1}) : ${step2.answer}\n\n` +
              `Réponse à la question 2 (${q2}) : ${step3.answer}\n\n` +
              `Analyse finale :\n${discordReply}`
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

      await saveMemory(interaction.guildId, memory);

      for (const msg of messagesToDelete) {
        if (!msg) continue;
        try {
          await msg.delete();
        } catch (_) {}
      }

      const parts = splitMessage(`📈 **Mise à jour de progression**\n\n${discordReply}`);
      for (const part of parts) {
        await interaction.channel.send(part);
      }
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