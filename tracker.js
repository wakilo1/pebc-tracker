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

// CORRECTION : Tri strict par date chronologique
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

// Chapitre théorique
let expectedChapterIndex = 0;
for (let i = 0; i < studyPlan.length; i++) {
  if (studyPlan[i].targetDate <= todayString) {
    expectedChapterIndex = i;
  }
}
const theoreticalChapter = studyPlan[expectedChapterIndex];

// Focus réel
const actualChapterIndex = studyPlan.findIndex(chap => chap.completed === false);
const focusChapter = actualChapterIndex !== -1 ? studyPlan[actualChapterIndex] : null;

// Calcul du retard
let delayCount = 0;
let statusMessage = "🟢 À JOUR ET PRÊT";

if (actualChapterIndex !== -1) {
  delayCount = expectedChapterIndex - actualChapterIndex;
  if (delayCount > 0) {
    statusMessage = `🔴 EN RETARD de ${delayCount} chapitre(s)`;
  } else if (delayCount < 0) {
    statusMessage = `🔵 EN AVANCE de ${Math.abs(delayCount)} chapitre(s)`;
  }
} else {
  statusMessage = "🏆 PLAN D'ÉTUDE TERMINÉ (PEBC READY)";
}

// ============================================================================
// 3. FORMULATION DU MESSAGE TELEGRAM
// ============================================================================
let messageText = `📅 Date : ${todayString}\n`;
messageText += `⏳ Jours avant PEBC : ${daysLeft} jours\n`;
messageText += `📊 Progression : ${progressBar} (${completedChapters}/${totalChapters})\n`;
messageText += `🚦 Statut : ${statusMessage}\n\n`;

if (theoreticalChapter) {
  messageText += `🎯 Théorique attendu :\n${theoreticalChapter.name}\n\n`;
}

if (focusChapter) {
  messageText += `👉 Focus réel du jour :\n${focusChapter.name}\n\n`;
  
  if (focusChapter.keywords && focusChapter.keywords.length > 0) {
    messageText += `Rappels cliniques à maîtriser :\n`;
    focusChapter.keywords.forEach(kw => {
      messageText += `- ${kw}\n`;
    });
  }
} else {
  messageText += `\n🎉 Félicitations confrère, le programme de révision est complété !`;
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
