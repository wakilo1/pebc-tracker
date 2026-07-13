const https = require('https');
const fs = require('fs');

const actionType = process.env.ACTION_TYPE || 'briefing';

// ============================================================================
// 1. LECTURE ET TRI DU JSON
// ============================================================================
let studyPlan = [];
try {
  const data = fs.readFileSync('./courses.json', 'utf8');
  studyPlan = JSON.parse(data);
} catch (err) {
  console.error("Erreur lecture courses.json:", err);
  process.exit(1);
}
studyPlan.sort((a, b) => new Date(a.targetDate) - new Date(b.targetDate));

// ============================================================================
// 2. VALIDATION AUTOMATIQUE (Si déclenché par le bouton)
// ============================================================================
let validatedChapter = null;
if (actionType === 'validate') {
  const actualIndex = studyPlan.findIndex(chap => chap.completed === false);
  if (actualIndex !== -1) {
    studyPlan[actualIndex].completed = true;
    validatedChapter = studyPlan[actualIndex];
    fs.writeFileSync('./courses.json', JSON.stringify(studyPlan, null, 2));
  }
}

// ============================================================================
// 3. CALCULS DES MÉTRIQUES
// ============================================================================
const todayDateObj = new Date();
const options = { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' };
const formatter = new Intl.DateTimeFormat('fr-CA', options);
const parts = formatter.formatToParts(todayDateObj);
const todayString = `${parts.find(p => p.type === 'year').value}-${parts.find(p => p.type === 'month').value}-${parts.find(p => p.type === 'day').value}`;

const examDate = new Date('2026-10-15T00:00:00-04:00');
const diffTime = examDate.getTime() - todayDateObj.getTime();
const daysLeft = Math.ceil(diffTime / (1000 * 3600 * 24));

const totalChapters = studyPlan.length;
const completedChapters = studyPlan.filter(chap => chap.completed).length;
const progressPercent = Math.round((completedChapters / totalChapters) * 100);

const filledBlocks = Math.round(progressPercent / 10);
const emptyBlocks = 10 - filledBlocks;
const progressBar = `[${'█'.repeat(filledBlocks)}${'░'.repeat(emptyBlocks)}] ${progressPercent}%`;

const overdueChapters = studyPlan.filter(chap => chap.targetDate < todayString && chap.completed === false);
const todaysChapters = studyPlan.filter(chap => chap.targetDate === todayString && chap.completed === false);
const nextChapters = studyPlan.filter(chap => chap.targetDate > todayString && chap.completed === false);

let delayCount = overdueChapters.length;
let statusMessage = "";
if (delayCount > 0) {
  statusMessage = `🔴 EN RETARD de ${delayCount} chapitre(s)`;
} else if (todaysChapters.length > 0) {
  statusMessage = `🟢 À JOUR`;
} else if (nextChapters.length > 0) {
  statusMessage = `🔵 EN AVANCE`;
} else {
  statusMessage = `🏆 PLAN D'ÉTUDE TERMINÉ`;
}

// ============================================================================
// 4. GÉNÉRATION DU DASHBOARD GITHUB (README.md)
// ============================================================================
let readme = `# 🚀 Tableau de Bord PEBC - Abdelwakil\n\n`;
readme += `> Objectif : Examen d'Évaluation du PEBC le 15 Octobre 2026 🎯\n\n`;
readme += `## 📊 Progression Globale\n`;
readme += `- **Avancement :** ${progressPercent}% ${progressBar} (${completedChapters}/${totalChapters} chapitres)\n`;
readme += `- **Compte à rebours :** ⏳ ${daysLeft} jours restants\n`;
readme += `- **Statut :** ${statusMessage}\n\n`;
readme += `## 📚 Vision d'Ensemble du Programme\n\n`;
readme += `| État | Date Cible | Chapitre |\n`;
readme += `|:---:|:---:|:---|\n`;

studyPlan.forEach(chap => {
  let icon = "📅"; // Futur
  if (chap.completed) {
    icon = "✅";
  } else if (chap.targetDate < todayString) {
    icon = "🔴"; // En retard
  } else if (chap.targetDate === todayString) {
    icon = "🔥"; // Aujourd'hui
  }
  readme += `| ${icon} | ${chap.targetDate} | ${chap.name} |\n`;
});

fs.writeFileSync('./README.md', readme);

// ============================================================================
// 5. MESSAGE TELEGRAM
// ============================================================================
let messageText = "";

if (actionType === 'validate') {
  if (validatedChapter) {
    messageText = `✅ Validation réussie !\n\nLe chapitre suivant a été marqué comme terminé et le Dashboard a été mis à jour :\n${validatedChapter.name}\n\n📊 Nouvelle progression : ${progressBar} ${progressPercent}%\n⏳ Jours avant PEBC : ${daysLeft} jours`;
  } else {
    messageText = `✅ Action lancée, mais aucun chapitre en attente n'a été trouvé. Tout est déjà validé !`;
  }
} else {
  messageText = `📅 Date : ${todayString}\n`;
  messageText += `⏳ Jours avant PEBC : ${daysLeft} jours\n`;
  messageText += `📊 Progression : ${progressBar} (${completedChapters}/${totalChapters})\n`;
  messageText += `🚦 Statut : ${statusMessage}\n\n`;

  if (overdueChapters.length > 0) {
    messageText += `⚠️ CHAPITRES EN RETARD À RATTRAPER :\n`;
    overdueChapters.forEach(chap => {
      messageText += `- ${chap.name} (Prévu le ${chap.targetDate})\n`;
    });
    messageText += `\n`;
  }

  if (todaysChapters.length > 0) {
    messageText += `🎯 AU PROGRAMME AUJOURD'HUI :\n`;
    todaysChapters.forEach(chap => {
      messageText += `- ${chap.name}\n`;
    });
  } else if (delayCount === 0 && nextChapters.length > 0) {
    messageText += `👉 PROCHAIN CHAPITRE (En avance) :\n`;
    messageText += `- ${nextChapters[0].name} (Prévu le ${nextChapters[0].targetDate})\n`;
  } else if (delayCount === 0 && nextChapters.length === 0) {
    messageText += `🎉 Félicitations, le programme de révision est complété !`;
  }
}

const telegramToken = process.env.TELEGRAM_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

if (!telegramToken || !chatId) {
  console.error("Erreur : Variables Telegram manquantes.");
  process.exit(1);
}

const payload = JSON.stringify({ chat_id: chatId, text: messageText });
const reqOptions = {
  hostname: 'api.telegram.org',
  port: 443,
  path: `/bot${telegramToken}/sendMessage`,
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
};

const req = https.request(reqOptions, (res) => {
  res.on('data', () => {});
  res.on('end', () => console.log("Opération terminée avec succès."));
});
req.on('error', (e) => console.error(e));
req.write(payload);
req.end();
