require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  AttachmentBuilder,
} = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════
//   KEEP-ALIVE SERVER (Render + cron-job.org)
// ═══════════════════════════════════════════════
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (_, res) => res.send('🐀 Piège à rat — Online'));
app.get('/ping', (_, res) => res.json({ status: 'alive', timestamp: new Date().toISOString() }));

app.listen(PORT, () => {
  console.log(`🌐 Keep-alive server démarré sur le port ${PORT}`);
});

// ═══════════════════════════════════════════════
//   CONFIG
// ═══════════════════════════════════════════════
const {
  DISCORD_TOKEN,
  HONEYPOT_CHANNEL_ID,
  LOG_CHANNEL_ID,
  WHITELIST_ROLE_IDS = '',
} = process.env;

if (!DISCORD_TOKEN || !HONEYPOT_CHANNEL_ID) {
  console.error('❌ DISCORD_TOKEN et HONEYPOT_CHANNEL_ID sont requis dans le .env');
  process.exit(1);
}

const whitelistRoles = WHITELIST_ROLE_IDS
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// ═══════════════════════════════════════════════
//   CLIENT DISCORD
// ═══════════════════════════════════════════════
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent, // Nécessite l'intent privilegié dans le Developer Portal
  ],
});

// ═══════════════════════════════════════════════
//   UTILS
// ═══════════════════════════════════════════════

/** Protège les admins / modos / rôles whitelistés */
function isProtected(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return true;
  if (member.permissions.has(PermissionFlagsBits.KickMembers)) return true;
  return member.roles.cache.some((r) => whitelistRoles.includes(r.id));
}

/** Timestamp Discord formaté (affichage long + relatif) */
function ts(date) {
  if (!date) return '*Inconnu*';
  const unix = Math.floor(date.getTime() / 1000);
  return `<t:${unix}:F> (<t:${unix}:R>)`;
}

/** Âge en jours depuis une date */
function ageDays(date) {
  if (!date) return null;
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

/** Crée le dossier logs/ si besoin */
function ensureLogsDir() {
  const dir = path.join(__dirname, 'logs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ═══════════════════════════════════════════════
//   GÉNÉRATION DU FICHIER LOG .TXT
// ═══════════════════════════════════════════════
function buildLogText({ user, member, message, action, guild }) {
  const now = new Date();
  const accountAgeDays = ageDays(user.createdAt);
  const joinAgeDays = ageDays(member?.joinedAt);

  const roles = member?.roles.cache
    .filter((r) => r.id !== guild.id)
    .map((r) => `  • ${r.name} (ID: ${r.id})`)
    .join('\n') || '  Aucun rôle';

  const attachmentUrls = message.attachments.size > 0
    ? [...message.attachments.values()].map((a) => `  • ${a.url}`).join('\n')
    : '  Aucune';

  const lines = [
    '╔══════════════════════════════════════════════╗',
    '║          🐀  PIÈGE À RAT — RAPPORT           ║',
    '╚══════════════════════════════════════════════╝',
    '',
    `📅  Horodatage       : ${now.toISOString()}`,
    `🏠  Serveur          : ${guild.name}`,
    `🆔  ID Serveur       : ${guild.id}`,
    '',
    '┌─────────────── UTILISATEUR ───────────────────',
    `│ 🏷️   Tag            : ${user.tag}`,
    `│ 🆔  ID             : ${user.id}`,
    `│ 💬  Pseudo serveur : ${member?.displayName ?? user.username}`,
    `│ 🖼️   Avatar         : ${user.displayAvatarURL({ size: 256, extension: 'png' })}`,
    '├─────────────── DATES ─────────────────────────',
    `│ 📆  Compte créé    : ${user.createdAt?.toISOString() ?? 'N/A'}`,
    `│                    (il y a ${accountAgeDays ?? '?'} jours)`,
    `│ 📥  A rejoint      : ${member?.joinedAt?.toISOString() ?? 'N/A'}`,
    `│                    (il y a ${joinAgeDays ?? '?'} jours)`,
    '├─────────────── RÔLES ─────────────────────────',
    roles,
    '├─────────────── MESSAGE ───────────────────────',
    `│ 📝  Contenu        : ${message.content || '*(aucun texte)*'}`,
    `│ 📎  Pièces jointes : ${message.attachments.size}`,
    attachmentUrls !== '  Aucune' ? `│ 🔗  URLs           :\n${attachmentUrls}` : '│ 🔗  URLs           : Aucune',
    '├─────────────── ACTION ────────────────────────',
    `│ ⚡  Action         : ${action}`,
    `│ 🗑️   Messages purge : 7 derniers jours (tous les salons)`,
    '└───────────────────────────────────────────────',
    '',
    '══════════════════════════════════════════════════',
    '  Généré automatiquement par le Piège à Rat Bot   ',
    '══════════════════════════════════════════════════',
  ];

  return lines.join('\n');
}

// ═══════════════════════════════════════════════
//   COMPONENTS V2 — MESSAGE D'AVERTISSEMENT
//   (envoyé dans le salon piège au démarrage)
// ═══════════════════════════════════════════════
function buildWarningComponents() {
  const container = new ContainerBuilder()
    .setAccentColor(0xFFD700)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('# 🪤  PIÈGE À RAT'),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '> ## ⚠️  ZONE INTERDITE ⚠️\n' +
        '> Ce salon est un **piège à rat**.\n' +
        '> Toute personne qui y écrit sera **immédiatement sanctionnée**.',
      ),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(false),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '🗑️  **Tous tes messages des 7 derniers jours** seront supprimés\n' +
        'dans **l\'intégralité du serveur**, sans exception.\n\n' +
        '🚫  Ne rien écrire. Ne rien envoyer. **Quitte ce salon.**',
      ),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '-# 🐀  Système de sécurité automatique — Les modérateurs ont été prévenus.',
      ),
    );

  return [container];
}

// ═══════════════════════════════════════════════
//   COMPONENTS V2 — LOG (salon de logs)
// ═══════════════════════════════════════════════
function buildLogComponents({ user, member, action, guild, logFileName }) {
  const accountAgeDays = ageDays(user.createdAt);
  const joinAgeDays = ageDays(member?.joinedAt);

  const roles = member?.roles.cache
    .filter((r) => r.id !== guild.id)
    .map((r) => `\`${r.name}\``)
    .join(' ') || '*Aucun rôle*';

  const container = new ContainerBuilder()
    .setAccentColor(0xFFD700)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('# 🐀  RAT ATTRAPÉ'),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true),
    )
    // Infos utilisateur
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '### 👤  Utilisateur\n' +
        `**Tag :** ${user.tag}\n` +
        `**ID :** \`${user.id}\`\n` +
        `**Mention :** <@${user.id}>\n` +
        `**Pseudo serveur :** ${member?.displayName ?? user.username}`,
      ),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(false),
    )
    // Dates
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '### 📅  Dates\n' +
        `**Compte créé :** ${ts(user.createdAt)} *(${accountAgeDays ?? '?'} jours)*\n` +
        `**A rejoint le serveur :** ${member?.joinedAt ? `${ts(member.joinedAt)} *(${joinAgeDays} jours)*` : '*Inconnu*'}`,
      ),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(false),
    )
    // Rôles
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### 🎭  Rôles\n${roles}`,
      ),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true),
    )
    // Action
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '### ⚡  Action effectuée\n' +
        `**${action}**\n` +
        '🗑️  *Messages supprimés : 7 derniers jours, tous les salons*',
      ),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(false),
    )
    // Footer
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# 📄  Log complet en pièce jointe : \`${logFileName}\``,
      ),
    );

  return [container];
}

// ═══════════════════════════════════════════════
//   READY EVENT
// ═══════════════════════════════════════════════
client.once('ready', async () => {
  console.log(`✅  Connecté en tant que ${client.user.tag}`);
  console.log(`🪤  Salon piège : ${HONEYPOT_CHANNEL_ID}`);
  console.log(`📋  Salon logs  : ${LOG_CHANNEL_ID ?? 'Non configuré'}`);

  try {
    const trapChannel = await client.channels.fetch(HONEYPOT_CHANNEL_ID);
    if (trapChannel?.isTextBased()) {
      await trapChannel.send({
        components: buildWarningComponents(),
        flags: MessageFlags.IsComponentsV2,
      });
      console.log('🪤  Message piège envoyé avec succès');
    } else {
      console.error('❌  Le salon HONEYPOT_CHANNEL_ID n\'est pas un salon textuel');
    }
  } catch (err) {
    console.error('❌  Impossible d\'envoyer le message piège :', err.message);
  }
});

// ═══════════════════════════════════════════════
//   MESSAGE CREATE — DÉTECTION
// ═══════════════════════════════════════════════
client.on('messageCreate', async (message) => {
  if (!message.guild || message.author.bot) return;
  if (message.channelId !== HONEYPOT_CHANNEL_ID) return;

  const { author: user, guild } = message;

  // Récupérer le membre (peut ne pas être en cache)
  const member = message.member
    ?? await guild.members.fetch(user.id).catch(() => null);

  // Protéger les admins / modos / rôles whitelistés
  if (isProtected(member)) {
    console.log(`🛡️  Membre protégé ignoré : ${user.tag} (${user.id})`);
    return;
  }

  // Supprimer le message déclencheur
  await message.delete().catch(() => {});

  const reason = '🐀 Piège à rat — message dans le salon piège (compte suspect/compromis)';
  let action = '';

  try {
    // Softban = ban + unban immédiat
    // deleteMessageSeconds à 604800 = 7 jours (maximum Discord)
    // → supprime tous les messages des 7 derniers jours dans TOUS les salons
    await guild.members.ban(user.id, {
      reason,
      deleteMessageSeconds: 7 * 24 * 60 * 60, // 604800 secondes = 7 jours
    });
    await guild.members.unban(user.id, 'Softban piège à rat — unban automatique').catch(() => {});
    action = '🔨 Softban (ban + unban, 7 jours de messages supprimés sur tout le serveur)';
  } catch (err) {
    action = `❌ Échec du softban : ${err.message}`;
    console.error('Erreur softban :', err);
  }

  console.log(`[🐀 PIÈGE] ${user.tag} (${user.id}) → ${action}`);

  // ─── Écriture du fichier log ───
  const logText = buildLogText({ user, member, message, action, guild });
  const logsDir = ensureLogsDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logFileName = `rat_${user.id}_${timestamp}.txt`;
  const logFilePath = path.join(logsDir, logFileName);
  fs.writeFileSync(logFilePath, logText, 'utf8');
  console.log(`📄  Log enregistré : ${logFileName}`);

  // ─── Envoi dans le salon de log ───
  if (!LOG_CHANNEL_ID) return;

  try {
    const logChannel = await guild.channels.fetch(LOG_CHANNEL_ID);
    if (!logChannel?.isTextBased()) return;

    await logChannel.send({
      components: buildLogComponents({ user, member, action, guild, logFileName }),
      files: [new AttachmentBuilder(logFilePath, { name: logFileName })],
      flags: MessageFlags.IsComponentsV2,
    });
  } catch (err) {
    console.error('❌  Impossible d\'envoyer le log :', err.message);
  }
});

// ═══════════════════════════════════════════════
//   LOGIN
// ═══════════════════════════════════════════════
client.login(DISCORD_TOKEN);
