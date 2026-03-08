require("dotenv").config();

const http = require("http");
const fs = require("fs");
const path = require("path");
const {
  Client,
  Collection,
  GatewayIntentBits,
  Events,
  MessageFlags
} = require("discord.js");

const PORT = process.env.PORT || 10000;

// Petit serveur HTTP pour Render + UptimeRobot
const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("ok");
  }

  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Bot Discord Minecraft en ligne");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Serveur HTTP actif sur le port ${PORT}`);
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.commands = new Collection();

const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter(file => file.endsWith(".js"));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);

  if (!command.data || !command.execute) {
    console.warn(`[WARN] La commande ${file} est invalide.`);
    continue;
  }

  client.commands.set(command.data.name, command);
}

client.once(Events.ClientReady, readyClient => {
  console.log(`✅ Connecté en tant que ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`❌ Erreur sur la commande ${interaction.commandName}:`, error);

    const errorMessage =
      "❌ Une erreur est survenue pendant l'exécution de la commande.";

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: errorMessage,
        flags: MessageFlags.Ephemeral
      });
    } else {
      await interaction.reply({
        content: errorMessage,
        flags: MessageFlags.Ephemeral
      });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);