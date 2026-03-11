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
const publicDir = path.join(__dirname, "public");
const bannerPath = path.join(publicDir, "banner.png");

function sendHtml(res, html, statusCode = 200) {
  res.writeHead(statusCode, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

function sendText(res, text, statusCode = 200) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function sendFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      return sendText(res, "404 - Fichier introuvable", 404);
    }

    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
}

function getBaseStyles(title) {
  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    :root {
      --bg: #0b1220;
      --panel: #101a2c;
      --panel-2: #16233b;
      --text: #eef4ff;
      --muted: #aab9d6;
      --accent: #76d275;
      --accent-2: #f3c84d;
      --link: #8bbcff;
      --border: rgba(255, 255, 255, 0.08);
      --shadow: 0 18px 50px rgba(0, 0, 0, 0.35);
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family: Inter, Arial, sans-serif;
      background:
        radial-gradient(circle at top, rgba(72, 142, 255, 0.18), transparent 35%),
        linear-gradient(180deg, #09111f 0%, #0b1220 100%);
      color: var(--text);
      min-height: 100vh;
    }

    a {
      color: var(--link);
      text-decoration: none;
    }

    a:hover {
      text-decoration: underline;
    }

    .page {
      max-width: 1080px;
      margin: 0 auto;
      padding: 28px 18px 48px;
    }

    .hero {
      background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.025));
      border: 1px solid var(--border);
      border-radius: 24px;
      box-shadow: var(--shadow);
      overflow: hidden;
      backdrop-filter: blur(6px);
    }

    .hero img {
      display: block;
      width: 100%;
      height: auto;
      background: #0f172a;
    }

    .hero-content {
      padding: 28px;
    }

    .badge {
      display: inline-block;
      background: rgba(118, 210, 117, 0.14);
      color: #baf0b9;
      border: 1px solid rgba(118, 210, 117, 0.2);
      padding: 6px 10px;
      border-radius: 999px;
      font-size: 13px;
      margin-bottom: 14px;
    }

    h1 {
      margin: 0 0 10px;
      font-size: clamp(28px, 5vw, 44px);
      line-height: 1.05;
    }

    h2 {
      margin: 0 0 14px;
      font-size: 28px;
    }

    h3 {
      margin: 26px 0 10px;
      font-size: 18px;
    }

    p, li {
      color: var(--muted);
      font-size: 16px;
      line-height: 1.65;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 20px;
    }

    .button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      padding: 0 16px;
      border-radius: 12px;
      border: 1px solid var(--border);
      background: var(--panel-2);
      color: var(--text);
      font-weight: 700;
      text-decoration: none;
      transition: transform 0.15s ease, background 0.15s ease;
    }

    .button:hover {
      text-decoration: none;
      transform: translateY(-1px);
      background: #1c2d4d;
    }

    .button.primary {
      background: linear-gradient(180deg, #81db80, #5cb35b);
      color: #09111f;
      border: none;
    }

    .grid {
      display: grid;
      gap: 18px;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      margin-top: 22px;
    }

    .card {
      background: rgba(255,255,255,0.03);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 18px;
    }

    .content {
      background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.02));
      border: 1px solid var(--border);
      border-radius: 24px;
      box-shadow: var(--shadow);
      padding: 28px;
      margin-top: 22px;
    }

    .meta {
      margin-top: 22px;
      font-size: 14px;
      color: #90a2c6;
    }

    ul {
      padding-left: 20px;
    }

    .top-link {
      display: inline-block;
      margin-bottom: 18px;
      font-weight: 700;
    }

    .footer {
      margin-top: 26px;
      color: #8ea3cc;
      font-size: 14px;
    }

    code {
      background: rgba(255,255,255,0.06);
      padding: 2px 6px;
      border-radius: 8px;
      color: #f7faff;
    }
  </style>
</head>
`;
}

function renderHomePage() {
  return `
${getBaseStyles("PST Java Bot")}
<body>
  <div class="page">
    <section class="hero">
      <img src="/banner.png" alt="Bannière PST Java Bot" />
      <div class="hero-content">
        <div class="badge">Bot Discord Minecraft Java</div>
        <h1>PST Java Bot</h1>
        <p>
          Assistant Discord conçu pour un serveur Minecraft Java entre amis :
          progression, mémoire du serveur, lieux, objectifs, farms et outils utiles
          au quotidien.
        </p>

        <div class="actions">
          <a class="button primary" href="/terms-of-service">Terms of Service</a>
          <a class="button" href="/privacy-policy">Privacy Policy</a>
          <a class="button" href="/health">Health Check</a>
        </div>

        <div class="grid">
          <div class="card">
            <h3>Fonctions</h3>
            <p>
              Progression du serveur, mémoire intelligente, objectifs de session,
              farms, coordonnées, lieux enregistrés et outils de suivi.
            </p>
          </div>
          <div class="card">
            <h3>Utilisation</h3>
            <p>
              Le bot est prévu pour une utilisation sur Discord, avec certaines données
              stockées afin d'améliorer les réponses et le suivi du serveur.
            </p>
          </div>
          <div class="card">
            <h3>Statut</h3>
            <p>
              Service web actif pour Render, supervision et pages d'information légales.
            </p>
          </div>
        </div>

        <div class="meta">
          Pages légales disponibles :
          <a href="/terms-of-service">/terms-of-service</a> ·
          <a href="/privacy-policy">/privacy-policy</a>
        </div>
      </div>
    </section>
  </div>
</body>
</html>
`;
}

function renderTermsPage() {
  return `
${getBaseStyles("Terms of Service - PST Java Bot")}
<body>
  <div class="page">
    <section class="content">
      <a class="top-link" href="/">← Retour à l'accueil</a>
      <h2>Terms of Service</h2>
      <p>
        Dernière mise à jour : ${new Date().toLocaleDateString("fr-FR")}
      </p>

      <p>
        Les présentes conditions d'utilisation régissent l'accès et l'utilisation du
        bot Discord <strong>PST Java Bot</strong>. En utilisant le bot, vous acceptez
        les présentes conditions.
      </p>

      <h3>1. Objet du service</h3>
      <p>
        PST Java Bot est un bot Discord destiné à assister un ou plusieurs serveurs,
        principalement autour d'un usage Minecraft Java. Il peut proposer des réponses,
        mémoriser certains éléments liés à la progression du serveur, enregistrer des
        coordonnées et fournir diverses fonctionnalités d'organisation.
      </p>

      <h3>2. Conditions d'utilisation</h3>
      <p>
        Vous acceptez d'utiliser le bot de manière raisonnable, légale et conforme aux
        règles de Discord. Vous ne devez pas utiliser le bot pour :
      </p>
      <ul>
        <li>nuire au fonctionnement d'un serveur Discord ;</li>
        <li>tenter d'exploiter le service de manière abusive ;</li>
        <li>envoyer des contenus illicites, malveillants ou trompeurs ;</li>
        <li>contourner les restrictions ou limites prévues par le service.</li>
      </ul>

      <h3>3. Disponibilité</h3>
      <p>
        Le bot est fourni <em>tel quel</em>. Aucune garantie n'est donnée quant à sa
        disponibilité permanente, son absence d'erreurs ou son maintien sans interruption.
        Le service peut être modifié, suspendu ou arrêté à tout moment.
      </p>

      <h3>4. Données et mémoire</h3>
      <p>
        Certaines fonctionnalités reposent sur un stockage de données, par exemple la
        mémoire du serveur, les lieux enregistrés, les objectifs ou un historique
        conversationnel limité. En utilisant le bot, vous acceptez que ces données soient
        utilisées pour améliorer le service et le contexte des réponses.
      </p>

      <h3>5. Contenus générés</h3>
      <p>
        Le bot peut produire des réponses automatisées. Malgré le soin apporté au service,
        ces réponses peuvent être incomplètes, imprécises ou inadaptées à certaines
        situations. Il appartient aux utilisateurs de garder un esprit critique.
      </p>

      <h3>6. Limitation de responsabilité</h3>
      <p>
        Dans toute la mesure permise par la loi, l'exploitant du bot ne pourra être tenu
        responsable des dommages directs, indirects, accessoires ou consécutifs résultant
        de l'utilisation ou de l'impossibilité d'utiliser le bot.
      </p>

      <h3>7. Résiliation et restriction d'accès</h3>
      <p>
        L'accès au bot peut être restreint ou supprimé pour tout utilisateur ou serveur
        qui enfreint les présentes conditions, perturbe le service ou en fait un usage abusif.
      </p>

      <h3>8. Modifications</h3>
      <p>
        Les présentes conditions peuvent être mises à jour à tout moment. La version publiée
        sur cette page fait foi à la date de consultation.
      </p>

      <h3>9. Contact</h3>
      <p>
        Pour toute question liée à ces conditions d'utilisation, utilisez les canaux de
        contact associés au bot ou au projet Discord concerné.
      </p>

      <div class="footer">
        Pages associées :
        <a href="/privacy-policy">Privacy Policy</a> ·
        <a href="/">Accueil</a>
      </div>
    </section>
  </div>
</body>
</html>
`;
}

function renderPrivacyPage() {
  return `
${getBaseStyles("Privacy Policy - PST Java Bot")}
<body>
  <div class="page">
    <section class="content">
      <a class="top-link" href="/">← Retour à l'accueil</a>
      <h2>Privacy Policy</h2>
      <p>
        Dernière mise à jour : ${new Date().toLocaleDateString("fr-FR")}
      </p>

      <p>
        Cette politique de confidentialité décrit les types de données susceptibles d'être
        traitées par <strong>PST Java Bot</strong>, la manière dont elles sont utilisées
        et les choix disponibles concernant ces données.
      </p>

      <h3>1. Données traitées</h3>
      <p>
        Le bot peut traiter certaines données techniques ou fonctionnelles nécessaires à
        son bon fonctionnement, notamment :
      </p>
      <ul>
        <li>l'identifiant du serveur Discord ;</li>
        <li>l'identifiant du salon Discord ;</li>
        <li>des noms de lieux, coordonnées et données liées aux commandes ;</li>
        <li>des éléments de mémoire sur la progression du serveur ;</li>
        <li>un historique conversationnel limité, si utilisé pour le contexte du bot ;</li>
        <li>des compteurs et statuts liés à certaines fonctionnalités.</li>
      </ul>

      <h3>2. Finalités</h3>
      <p>
        Ces données sont utilisées uniquement pour faire fonctionner les commandes du bot,
        personnaliser certaines réponses, conserver un contexte utile et améliorer
        l'expérience d'utilisation au sein du serveur Discord concerné.
      </p>

      <h3>3. Partage des données</h3>
      <p>
        Les données stockées par le bot ne sont pas destinées à être revendues. Elles
        peuvent toutefois transiter via des fournisseurs techniques nécessaires au service,
        comme l'hébergement ou les services d'IA appelés par certaines commandes.
      </p>

      <h3>4. Conservation</h3>
      <p>
        Les données sont conservées aussi longtemps que nécessaire au fonctionnement du bot,
        sauf suppression manuelle, réinitialisation ou arrêt du service. Certaines commandes
        permettent d'effacer tout ou partie de la mémoire stockée.
      </p>

      <h3>5. Suppression et contrôle</h3>
      <p>
        Selon les fonctionnalités activées, certaines données peuvent être supprimées via
        des commandes du bot, par exemple la mémoire du salon ou la mémoire globale du
        serveur. En cas de doute, considérez que les données peuvent rester stockées tant
        qu'elles n'ont pas été effacées explicitement.
      </p>

      <h3>6. Sécurité</h3>
      <p>
        Des mesures raisonnables sont prises pour limiter les accès non autorisés, mais
        aucune méthode de stockage ou de transmission n'est totalement infaillible.
      </p>

      <h3>7. Mineurs</h3>
      <p>
        Le bot n'est pas conçu spécifiquement pour collecter des données personnelles
        sensibles ni pour cibler des mineurs. Les utilisateurs doivent employer le service
        sous la responsabilité de leur serveur Discord et dans le respect des règles applicables.
      </p>

      <h3>8. Modifications</h3>
      <p>
        Cette politique peut être mise à jour à tout moment. La version disponible sur cette
        page est la version de référence.
      </p>

      <h3>9. Contact</h3>
      <p>
        Pour toute question liée à la confidentialité ou aux données du bot, utilisez les
        moyens de contact associés au projet.
      </p>

      <div class="footer">
        Pages associées :
        <a href="/terms-of-service">Terms of Service</a> ·
        <a href="/">Accueil</a>
      </div>
    </section>
  </div>
</body>
</html>
`;
}

// Petit serveur HTTP pour Render + UptimeRobot + pages légales
const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    return sendText(res, "ok");
  }

  if (req.url === "/banner.png") {
    return sendFile(res, bannerPath, "image/png");
  }

  if (req.url === "/terms-of-service") {
    return sendHtml(res, renderTermsPage());
  }

  if (req.url === "/privacy-policy") {
    return sendHtml(res, renderPrivacyPage());
  }

  if (req.url === "/" || req.url === "/index.html") {
    return sendHtml(res, renderHomePage());
  }

  return sendText(res, "404 - Page non trouvée", 404);
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