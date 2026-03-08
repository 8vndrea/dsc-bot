require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { REST, Routes } = require("discord.js");

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !clientId || !guildId) {
  console.error("❌ Variables .env manquantes.");
  console.error("Vérifie DISCORD_TOKEN, DISCORD_CLIENT_ID et DISCORD_GUILD_ID.");
  process.exit(1);
}

const commands = [];
const commandsPath = path.join(__dirname, "commands");

if (!fs.existsSync(commandsPath)) {
  console.error("❌ Dossier commands introuvable.");
  process.exit(1);
}

const commandFiles = fs
  .readdirSync(commandsPath)
  .filter(file => file.endsWith(".js"));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);

  if (!command.data || !command.execute) {
    console.warn(`[WARN] La commande ${file} est invalide et sera ignorée.`);
    continue;
  }

  commands.push(command.data.toJSON());
}

const rest = new REST({ version: "10" }).setToken(token);

(async () => {
  try {
    console.log("🔄 Déploiement des commandes slash...");

    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    );

    console.log("✅ Commandes slash déployées avec succès.");
  } catch (error) {
    console.error("❌ Erreur pendant le déploiement des commandes :", error);
  }
})();