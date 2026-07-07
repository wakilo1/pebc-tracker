const https = require('https');
const fs = require('fs');

// ============================================================================
// 1. LECTURE ET TRI DE LA BASE DE DONNÉES JSON
// ============================================================================
let studyPlan = [];
try {
  const data = fs.readFileSync('./courses.json', 'utf8');
  studyPlan = JSON.parse(data);
} catch (err) {
  console.error("Erreur lors de la lecture du fichier courses.json:", err);
  process.exit(1);
}

// Tri par date chronologique
studyPlan.sort((a, b) => new Date(a.targetDate) - new Date(b.targetDate));

// ============================================================================
// 2. LOGIQUE DE CALCUL DES MÉTRIQUES
// ============================================================================
// Date du jour (Québec)
const todayDateObj = new Date();
const options = { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' };
const formatter = new Intl.DateTimeFormat('fr-CA', options);
const parts = formatter.formatToParts(todayDateObj);
const todayString = `${parts.find(p => p.type === 'year').value}-${parts.find(p => p.type === 'month').value}-${parts.find(p => p.type === 'day').value}`;

// Compte à rebours PEBC (15 Octobre 2026)
const examDate = new Date('2026-10-15T00:00:00-04:00');
const diffTime = examDate.getTime() - todayDateObj.getTime();
const daysLeft = Math.ceil(diffTime / (1000 * 3600 * 24));

// Progression globale
const totalChapters = studyPlan.length;
const completedChapters = studyPlan.filter(chap => chap.completed).length;
const progressPercent = Math.round((completedChapters / totalChapters) * 100);

// Barre visuelle
const filledBlocks = Math.round(progressPercent / 10);
const emptyBlocks = 10 - filledBlocks;
const progressBar = `[${'█'.repeat(filledBlocks)}${'░'.repeat(emptyBlocks)}] ${progressPercent}%`;

// Extraction intelligente des chapitres
const overdueChapters = studyPlan.filter(chap => chap.targetDate < todayString && chap.completed === false);
const todaysChapters = studyPlan.filter(chap => chap.targetDate === todayString && chap.completed === false);
const nextChapters = studyPlan.filter(chap => chap.targetDate > todayString && chap.completed === false);

// Calcul du statut
let delayCount = overdueChapters.length;
let statusMessage = "";

if (delayCount > 0) {
  statusMessage = `🔴 EN RETARD de ${delayCount} chapitre(s)`;
} else if (todaysChapters.length > 0) {
  statusMessage = `🟢 À JOUR`;
} else if (nextChapters.length > 0) {
  statusMessage = `🔵 EN AVANCE`;
} else {
  statusMessage = `🏆 PLAN D'ÉTUDE TERMINÉ (PEBC READY)`;
}

// ============================================================================
// 3. FORMULATION DU MESSAGE TELEGRAM
// ============================================================================
let messageText = `📅 Date : ${todayString}\n`;
messageText += `⏳ Jours avant PEBC : ${daysLeft} jours\n`;
messageText += `📊 Progression : ${progressBar} (${completedChapters}/${totalChapters})\n`;
messageText += `🚦 Statut : ${statusMessage}\n\n`;

// Si retard, on liste tout
if (overdueChapters.length > 0) {
  messageText += `⚠️ CHAPITRES EN RETARD À RATTRAPER :\n`;
  overdueChapters.forEach(chap => {
    messageText += `- ${chap.name} (Prévu le ${chap.targetDate})\n`;
  });
  messageText += `\n`;
}

// Si des chapitres sont prévus aujourd'hui
if (todaysChapters.length > 0) {
  messageText += `🎯 AU PROGRAMME AUJOURD'HUI :\n`;
  todaysChapters.forEach(chap => {
    messageText += `- ${chap.name}\n`;
  });
} 
// Si tout est à jour ou en avance, on affiche le prochain
else if (delayCount === 0 && nextChapters.length > 0) {
  messageText += `👉 PROCHAIN CHAPITRE (En avance) :\n`;
  messageText += `- ${nextChapters[0].name} (Prévu le ${nextChapters[0].targetDate})\n`;
} 
// Si tout est fini
else if (delayCount === 0 && nextChapters.length === 0) {
   messageText += `🎉 Félicitations, le programme de révision est complété !`;
}

// ============================================================================
// 4. TRANSMISSION RÉSEAU (TELEGRAM)
// ============================================================================
const telegramToken = process.env.TELEGRAM_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

if (!telegramToken || !chatId) {
  console.error("Erreur : Variables TELEGRAM_TOKEN et TELEGRAM_CHAT_ID requises.");
  process.exit(1);
}

const payload = JSON.stringify({
  chat_id: chatId,
  text: messageText
});

const reqOptions = {
  hostname: 'api.telegram.org',
  port: 443,
  path: `/bot${telegramToken}/sendMessage`,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
};

const req = https.request(reqOptions, (res) => {
  let responseBody = '';
  res.on('data', (chunk) => responseBody += chunk);
  res.on('end', () => {
    if (res.statusCode === 200) {
      console.log("Briefing clinique envoyé avec succès !");
    } else {
      console.error(`Erreur d'envoi. Statut : ${res.statusCode}`);
    }
  });
});

req.on('error', (e) => console.error(e.message));
req.write(payload);
req.end();
