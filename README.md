# 🐀 Piège à Rat — Bot Discord

Bot de sécurité qui détecte et sanctionne automatiquement toute personne qui écrit dans un salon piège.

**Ce que ça fait :**
- Envoie un embed d'avertissement (Components V2, thème jaune) dans le salon piège au démarrage
- Dès qu'un non-modérateur écrit dedans → **softban** (ban + unban immédiat)
- **Supprime les 7 derniers jours de messages** de l'intrus dans tout le serveur
- Génère un fichier log `.txt` détaillé (ID, dates, rôles, contenu du message...)
- Envoie un rapport dans le salon de logs (Components V2)
- Serveur Express intégré pour le keep-alive sur Render

---

## 📋 Pré-requis

- Node.js ≥ 18
- Un bot Discord avec les permissions : `Kick Members`, `Ban Members`, `Manage Messages`
- Les intents activés dans le Developer Portal (voir ci-dessous)

---

## ⚙️ Configuration

### 1. Cloner le repo et installer

```bash
git clone https://github.com/TON_COMPTE/piege-a-rat.git
cd piege-a-rat
npm install
```

### 2. Créer le fichier `.env`

```bash
cp .env.example .env
```

Remplir les valeurs dans `.env` :

| Variable | Obligatoire | Description |
|---|---|---|
| `DISCORD_TOKEN` | ✅ | Token du bot (Developer Portal) |
| `HONEYPOT_CHANNEL_ID` | ✅ | ID du salon piège |
| `LOG_CHANNEL_ID` | ⬜ | ID du salon de logs |
| `WHITELIST_ROLE_IDS` | ⬜ | IDs de rôles immunisés (séparés par `,`) |

### 3. Activer les Intents Discord

Dans le [Discord Developer Portal](https://discord.com/developers/applications) :

```
Ton application → Bot → Privileged Gateway Intents
✅ SERVER MEMBERS INTENT
✅ MESSAGE CONTENT INTENT
```

### 4. Lancer en local

```bash
npm start
```

---

## 🌐 Déploiement sur Render + cron-job.org

### Étape 1 — Mettre le code sur GitHub

```bash
git init
git add .
git commit -m "🐀 Initial commit"
git remote add origin https://github.com/TON_COMPTE/piege-a-rat.git
git push -u origin main
```

> ⚠️ Le `.env` est dans `.gitignore` → tes tokens ne seront **jamais** publiés.

### Étape 2 — Créer le service sur Render

1. Va sur [render.com](https://render.com) → **New +** → **Web Service**
2. Connecte ton repo GitHub
3. Configure :
   - **Name :** `piege-a-rat`
   - **Runtime :** `Node`
   - **Build Command :** `npm install`
   - **Start Command :** `npm start`
   - **Plan :** `Free`

4. Dans **Environment Variables**, ajoute :

   | Key | Value |
   |---|---|
   | `DISCORD_TOKEN` | Ton token |
   | `HONEYPOT_CHANNEL_ID` | L'ID du salon |
   | `LOG_CHANNEL_ID` | L'ID des logs |
   | `WHITELIST_ROLE_IDS` | Les IDs de rôles |

5. **Create Web Service** → Render va build et démarrer le bot

### Étape 3 — Keep-alive avec cron-job.org

Le plan gratuit Render endort les services après ~15 min d'inactivité.
On ping toutes les 10 minutes pour le garder éveillé.

1. Va sur [cron-job.org](https://cron-job.org) → **Create cronjob**
2. **URL :** `https://NOM_DE_TON_SERVICE.onrender.com/ping`
3. **Schedule :** Every 10 minutes (ou utilise `*/10 * * * *`)
4. **Save** → activé ✅

Le bot sera désormais **toujours en ligne**. 🟢

---

## 📁 Structure

```
piege-a-rat/
├── index.js          # Bot principal
├── package.json
├── .env.example      # Template de config (safe pour GitHub)
├── .env              # Tes vraies valeurs (gitignored !)
├── .gitignore
├── README.md
└── logs/             # Fichiers .txt générés automatiquement (gitignored)
```

---

## 🔒 Sécurité

- Les admins, modérateurs (`Manage Messages`, `Kick Members`) et rôles whitelistés sont **toujours ignorés**
- Le token Discord ne quitte jamais ton environnement (`.gitignore` + variables Render)
- Chaque incident génère un log archivé localement dans `logs/`
