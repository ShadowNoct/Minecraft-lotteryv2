const ADMIN_CODE = "StoneHub";

const keys = {
  players: "lotteryV2Players",
  history: "lotteryV2History",
  webhook: "lotteryV2Webhook",
  embedTitle: "lotteryV2EmbedTitle",
  embedFooter: "lotteryV2EmbedFooter",
  embedImage: "lotteryV2EmbedImage",
  admin: "lotteryV2Admin",
  theme: "lotteryV2Theme"
};

const colors = [
  "#ff5a1f", "#ffcc00", "#5865f2", "#2ecc71", "#e91e63",
  "#9b59b6", "#00bcd4", "#f39c12", "#1abc9c", "#e74c3c",
  "#3498db", "#ff66cc", "#95a5a6", "#d35400", "#27ae60",
  "#c0392b", "#8e44ad", "#16a085", "#f1c40f", "#e67e22"
];

let players = {};
let history = [];
let playerColors = {};
let totalTickets = 0;
let wheelRotation = 0;
let spinning = false;
let entriesLocked = false;
let lastWinner = "";

const $ = (id) => document.getElementById(id);

const el = {};

function cacheElements() {
  [
    "adminLogin", "adminCodeInput", "adminStatus", "adminPanel", "webhookInput",
    "webhookStatus", "embedTitleInput", "embedFooterInput", "embedImageInput",
    "patchModal", "prizeAmountInput", "prizeItemInput", "playerNameInput",
    "ticketAmountInput", "playerSelect", "playersList", "lockStatus",
    "lockEntriesBtn", "winnerText", "winnerCard", "winnerName", "winnerPrize",
    "historyList", "wheelCanvas"
  ].forEach((id) => {
    el[id] = $(id);
  });
}

function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadJSON(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
}

function getPrizeText() {
  const amount = el.prizeAmountInput.value.trim();
  const item = el.prizeItemInput.value.trim() || "Gold";
  return amount ? amount + " " + item : "Prize not set";
}

function assignColors() {
  Object.keys(players).forEach((name, index) => {
    playerColors[name] = colors[index % colors.length];
  });
}

function calculateTotalTickets() {
  totalTickets = Object.values(players).reduce((sum, tickets) => sum + tickets, 0);
}

function getPercent(tickets) {
  if (!totalTickets) return "0.0%";
  return ((tickets / totalTickets) * 100).toFixed(1) + "%";
}

function savePlayers() {
  saveJSON(keys.players, players);
}

function loadPlayers() {
  players = loadJSON(keys.players, {});
  assignColors();
  calculateTotalTickets();
}

function updatePlayersDisplay() {
  assignColors();
  calculateTotalTickets();

  const names = Object.keys(players);
  el.playerSelect.innerHTML = "";

  if (!names.length) {
    el.playersList.textContent = "No players added yet.";
    el.playerSelect.innerHTML = "<option>No players added yet</option>";
    return;
  }

  let html = "";

  names.forEach((name) => {
    const tickets = players[name];
    const color = playerColors[name];

    html += `
      <div class="row">
        <span class="color" style="background:${color}"></span>
        <div>
          <strong>${name}</strong>
          <small>${tickets} ticket(s)</small>
        </div>
        <div class="percent">${getPercent(tickets)}</div>
      </div>
    `;

    const option = document.createElement("option");
    option.value = name;
    option.textContent = name + " â " + tickets + " ticket(s)";
    el.playerSelect.appendChild(option);
  });

  if (totalTickets > 0) {
    html += `
      <div class="row">
        <span class="color" style="background:#ffcc00"></span>
        <div>
          <strong>Visual Wheel</strong>
          <small>Each player shows as up to 3 chunks. Odds still use real tickets.</small>
        </div>
        <div class="percent">FAIR</div>
      </div>
    `;
  }

  el.playersList.innerHTML = html;
}

function addPlayer() {
  if (entriesLocked) {
    alert("Entries are locked. Unlock entries before editing players.");
    return;
  }

  const name = el.playerNameInput.value.trim();
  const tickets = Number.parseInt(el.ticketAmountInput.value, 10);

  if (!name || !Number.isFinite(tickets) || tickets < 1) {
    alert("Enter a player name and ticket amount.");
    return;
  }

  players[name] = tickets;
  lastWinner = "";
  el.playerNameInput.value = "";
  el.ticketAmountInput.value = "";

  savePlayers();
  updatePlayersDisplay();
  drawWheel();
}

function removePlayer() {
  if (entriesLocked) {
    alert("Entries are locked. Unlock entries before removing players.");
    return;
  }

  const selected = el.playerSelect.value;
  if (!selected || !players[selected]) {
    alert("Select a player first.");
    return;
  }

  delete players[selected];
  lastWinner = "";

  savePlayers();
  updatePlayersDisplay();
  drawWheel();
}

function setLockState() {
  el.playerNameInput.disabled = entriesLocked;
  el.ticketAmountInput.disabled = entriesLocked;
  el.prizeAmountInput.disabled = entriesLocked;
  el.prizeItemInput.disabled = entriesLocked;
  el.playerSelect.disabled = entriesLocked;

  $("addPlayerBtn").disabled = entriesLocked;
  $("removePlayerBtn").disabled = entriesLocked;
  $("clearAllBtn").disabled = entriesLocked;

  el.lockEntriesBtn.textContent = entriesLocked ? "Unlock Entries" : "Lock Entries";
  el.lockStatus.textContent = entriesLocked ? "Entries are locked." : "";
}

function toggleLockEntries() {
  if (!entriesLocked && !Object.keys(players).length) {
    alert("Add players before locking entries.");
    return;
  }

  entriesLocked = !entriesLocked;
  setLockState();
}

function getWeightedWinner() {
  const total = Object.values(players).reduce((sum, tickets) => sum + tickets, 0);
  let roll = Math.floor(Math.random() * total) + 1;

  for (const [name, tickets] of Object.entries(players)) {
    roll -= tickets;
    if (roll <= 0) return name;
  }

  return Object.keys(players)[0] || "";
}

function buildVisualSegments() {
  const names = Object.keys(players);
  calculateTotalTickets();

  if (!names.length || !totalTickets) return [];

  const chunks = [];

  names.forEach((name, playerIndex) => {
    const tickets = players[name];
    const oddsPercent = totalTickets > 0 ? (tickets / totalTickets) * 100 : 0;

    let chunkCount = 1;

    // IMPORTANT:
    // Under 8% MUST stay as one single visual chunk.
    // 8% to 19.99% can use two chunks.
    // 20%+ can use three chunks.
    if (names.length > 1 && oddsPercent >= 20) {
      chunkCount = 3;
    } else if (names.length > 1 && oddsPercent >= 8) {
      chunkCount = 2;
    } else {
      chunkCount = 1;
    }

    const baseWeight = Math.floor(tickets / chunkCount);
    let leftover = tickets % chunkCount;

    for (let i = 0; i < chunkCount; i++) {
      const extra = leftover > 0 ? 1 : 0;
      leftover -= extra;

      chunks.push({
        name: name,
        weight: baseWeight + extra,
        oddsPercent: oddsPercent,
        playerIndex: playerIndex,
        chunkIndex: i,
        isSmall: oddsPercent < 8
      });
    }
  });

  // Put bigger chunks down first, then insert small chunks into the best gaps.
  const largeChunks = chunks.filter(chunk => !chunk.isSmall).sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    return a.playerIndex - b.playerIndex;
  });

  const smallChunks = chunks.filter(chunk => chunk.isSmall).sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    return a.playerIndex - b.playerIndex;
  });

  const arranged = [];

  function getNeighbors(list, spot) {
    if (!list.length) {
      return { left: null, right: null };
    }

    return {
      left: list[(spot - 1 + list.length) % list.length] || null,
      right: list[spot % list.length] || null
    };
  }

  function placeChunk(chunk) {
    if (!arranged.length) {
      arranged.push(chunk);
      return;
    }

    let bestSpot = 0;
    let bestScore = -Infinity;

    for (let spot = 0; spot <= arranged.length; spot++) {
      const { left, right } = getNeighbors(arranged, spot);
      let score = 0;

      if (left && left.name === chunk.name) score -= 100000;
      if (right && right.name === chunk.name) score -= 100000;

      // Under-8% chunks should not sit beside other under-8% chunks if possible.
      if (chunk.isSmall && left && left.isSmall) score -= 50000;
      if (chunk.isSmall && right && right.isSmall) score -= 50000;

      // Under-8% chunks prefer being between bigger chunks.
      if (chunk.isSmall && left && !left.isSmall) score += 3000;
      if (chunk.isSmall && right && !right.isSmall) score += 3000;

      // Spread chunks from the same player far apart.
      let nearestSameDistance = arranged.length + 1;

      arranged.forEach((existing, existingIndex) => {
        if (existing.name !== chunk.name) return;

        const rawDistance = Math.abs(existingIndex - spot);
        const circularDistance = Math.min(rawDistance, arranged.length - rawDistance);
        nearestSameDistance = Math.min(nearestSameDistance, circularDistance);
      });

      score += nearestSameDistance * 500;

      // Prefer bigger neighbors so small chunks get tucked into clean gaps.
      if (left) score += left.weight * 0.25;
      if (right) score += right.weight * 0.25;

      score += Math.random();

      if (score > bestScore) {
        bestScore = score;
        bestSpot = spot;
      }
    }

    arranged.splice(bestSpot, 0, chunk);
  }

  largeChunks.forEach(placeChunk);
  smallChunks.forEach(placeChunk);

  return arranged;
}

function getDisplayTarget(winnerName) {
  const segments = buildVisualSegments();
  const matchingIndexes = [];

  segments.forEach((segment, index) => {
    const angle = (segment.weight / totalWeight) * Math.PI * 2;

    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.arc(center, center, radius, start, start + angle);
    ctx.closePath();
    ctx.fillStyle = playerColors[segment.name] || "#888";
    ctx.fill();

    // Under-8% players are one solid chunk.
    // No inner stroke on them, so they do not look like 2-3 thin lines.
    if (!segment.isSmall) {
      const nextSegment = segments[(index + 1) % segments.length];

      if (!nextSegment || nextSegment.name !== segment.name) {
        ctx.strokeStyle = highTicketMode ? "rgba(0,0,0,.10)" : "rgba(0,0,0,.06)";
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }

    start += angle;
  });

  ctx.strokeStyle = "rgba(255,255,255,.35)";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(center, center, highTicketMode ? 46 : 22, 0, Math.PI * 2);
  ctx.fill();

  if (highTicketMode) {
    ctx.fillStyle = "#111827";
    ctx.font = "bold 15px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(totalTickets), center, center - 6);
    ctx.font = "bold 10px Arial";
    ctx.fillText("tickets", center, center + 12);
  }
}

function buildWheel() {
  updatePlayersDisplay();
  wheelRotation = 0;
  drawWheel();
  el.winnerText.textContent = "";
}

function spinWheel() {
  if (spinning) return;

  if (!Object.keys(players).length) {
    alert("Add players first.");
    return;
  }

  spinning = true;
  el.winnerText.textContent = "";
  el.winnerCard.style.display = "none";

  const winnerName = getWeightedWinner();
  const result = getDisplayTarget(winnerName);
  const segments = result.segments;
  const targetPercent = result.targetPercent;

  const targetAngle = targetPercent * 360;
  const currentMod = ((wheelRotation % 360) + 360) % 360;
  const neededToTop = (360 - targetAngle - currentMod + 360) % 360;

  const startRotation = wheelRotation;
  const endRotation = startRotation + 360 * 8 + neededToTop;
  const duration = 6200;
  const startTime = performance.now();

  function animate(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);

    wheelRotation = startRotation + (endRotation - startRotation) * eased;
    drawWheel(segments);

    if (progress < 1) {
      requestAnimationFrame(animate);
      return;
    }

    wheelRotation = endRotation;
    drawWheel(segments);

    lastWinner = winnerName;
    el.winnerText.textContent = "Winner: " + winnerName;
    el.winnerCard.style.display = "block";
    el.winnerName.textContent = winnerName;
    el.winnerPrize.textContent = "Prize: " + getPrizeText();

    addHistory(winnerName);
    spinning = false;
  }

  requestAnimationFrame(animate);
}

function addHistory(winnerName) {
  const entry = "Draw #" + (history.length + 1) + " â " + winnerName + " won | Prize: " + getPrizeText();
  history.unshift(entry);
  saveJSON(keys.history, history);
  updateHistoryDisplay();
}

function loadHistory() {
  history = loadJSON(keys.history, []);
}

function updateHistoryDisplay() {
  el.historyList.textContent = history.length ? history.join("\n") : "Draw history will show here.";
}

function clearHistory() {
  if (!confirm("Clear saved draw history?")) return;
  history = [];
  saveJSON(keys.history, history);
  updateHistoryDisplay();
}

function clearAll() {
  if (entriesLocked) {
    alert("Unlock entries before clearing everything.");
    return;
  }

  if (!confirm("Clear all players and current wheel? Draw history will stay unless you clear it separately.")) {
    return;
  }

  players = {};
  totalTickets = 0;
  wheelRotation = 0;
  lastWinner = "";

  savePlayers();
  updatePlayersDisplay();
  drawWheel();

  el.winnerText.textContent = "";
  el.winnerCard.style.display = "none";
  el.winnerName.textContent = "No winner yet";
  el.winnerPrize.textContent = "Prize not set";
}

function loadWebhook() {
  const saved = localStorage.getItem(keys.webhook);
  el.webhookStatus.textContent = saved ? "Webhook is saved on this device." : "No webhook saved yet.";
}

function saveWebhook() {
  const value = el.webhookInput.value.trim();

  if (!value.startsWith("https://discord.com/api/webhooks/")) {
    el.webhookStatus.textContent = "Paste a valid Discord webhook URL.";
    return;
  }

  localStorage.setItem(keys.webhook, value);
  el.webhookInput.value = "";
  el.webhookStatus.textContent = "Webhook saved on this device.";
}

function loadEmbedSettings() {
  el.embedTitleInput.value = localStorage.getItem(keys.embedTitle) || "Minecraft Lottery Result";
  el.embedFooterInput.value = localStorage.getItem(keys.embedFooter) || "Lottery Wheel";
  el.embedImageInput.value = localStorage.getItem(keys.embedImage) || "";
}

function saveEmbedSettings() {
  localStorage.setItem(keys.embedTitle, el.embedTitleInput.value.trim() || "Minecraft Lottery Result");
  localStorage.setItem(keys.embedFooter, el.embedFooterInput.value.trim() || "Lottery Wheel");
  localStorage.setItem(keys.embedImage, el.embedImageInput.value.trim());
  el.webhookStatus.textContent = "Embed settings saved.";
}

function getEmbedSettings() {
  return {
    title: localStorage.getItem(keys.embedTitle) || "Minecraft Lottery Result",
    footer: localStorage.getItem(keys.embedFooter) || "Lottery Wheel",
    image: localStorage.getItem(keys.embedImage) || ""
  };
}

function makeEmbed(title, fields) {
  const settings = getEmbedSettings();
  const embed = {
    title: title || settings.title,
    color: 16734751,
    fields: fields,
    footer: { text: settings.footer },
    timestamp: new Date().toISOString()
  };

  if (settings.image) {
    embed.image = { url: settings.image };
  }

  return embed;
}

async function sendWebhookEmbed(embed, successText) {
  const webhook = localStorage.getItem(keys.webhook);

  if (!webhook) {
    el.webhookStatus.textContent = "No webhook saved.";
    return;
  }

  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "Lottery Wheel", embeds: [embed] })
    });

    el.webhookStatus.textContent = response.ok || response.status === 204 ? successText : "Discord send failed.";
  } catch {
    el.webhookStatus.textContent = "Could not send. Check webhook or internet.";
  }
}

function sendLotteryOpen() {
  const embed = makeEmbed("Lottery Open", [
    { name: "Prize", value: getPrizeText(), inline: false },
    { name: "Status", value: "Entries are open.", inline: false }
  ]);

  sendWebhookEmbed(embed, "Lottery open announcement sent.");
}

function sendEntriesLocked() {
  if (!entriesLocked) {
    el.webhookStatus.textContent = "Lock entries first.";
    return;
  }

  const embed = makeEmbed("Lottery Entries Locked", [
    { name: "Prize", value: getPrizeText(), inline: false },
    { name: "Players", value: String(Object.keys(players).length), inline: true },
    { name: "Total Tickets", value: String(totalTickets), inline: true }
  ]);

  sendWebhookEmbed(embed, "Entries locked announcement sent.");
}

function sendDiscord() {
  if (!lastWinner) {
    el.webhookStatus.textContent = "Spin first so there is a winner.";
    return;
  }

  const embed = makeEmbed(getEmbedSettings().title, [
    { name: "Winner", value: lastWinner, inline: false },
    { name: "Prize", value: getPrizeText(), inline: false }
  ]);

  sendWebhookEmbed(embed, "Result sent to Discord.");
}

function showAdminLogin() {
  el.adminLogin.style.display = "grid";
  el.adminStatus.textContent = "";
}

function hideAdminLogin() {
  el.adminLogin.style.display = "none";
}

function loginAdmin() {
  if (el.adminCodeInput.value !== ADMIN_CODE) {
    el.adminStatus.textContent = "Wrong admin code.";
    return;
  }

  localStorage.setItem(keys.admin, "true");
  el.adminLogin.style.display = "none";
  el.adminPanel.style.display = "block";
  loadWebhook();
  loadEmbedSettings();
}

function logoutAdmin() {
  localStorage.removeItem(keys.admin);
  el.adminPanel.style.display = "none";
  el.webhookInput.value = "";
  el.webhookStatus.textContent = "";
}

function checkAdmin() {
  el.adminPanel.style.display = localStorage.getItem(keys.admin) === "true" ? "block" : "none";
  if (el.adminPanel.style.display === "block") {
    loadWebhook();
    loadEmbedSettings();
  }
}

function showPatchNotes() {
  el.patchModal.style.display = "grid";
}

function hidePatchNotes() {
  el.patchModal.style.display = "none";
}


function applyTheme(theme) {
  document.body.classList.toggle("lightMode", theme === "light");
  localStorage.setItem(keys.theme, theme);

  const themeBtn = $("themeToggleBtn");
  if (themeBtn) {
    themeBtn.textContent = theme === "light" ? "Dark Mode" : "Light Mode";
  }
}

function loadTheme() {
  const savedTheme = localStorage.getItem(keys.theme) || "dark";
  applyTheme(savedTheme);
}

function toggleTheme() {
  const isLight = document.body.classList.contains("lightMode");
  applyTheme(isLight ? "dark" : "light");
}

function bindEvents() {
  $("adminToolsBtn").addEventListener("click", showAdminLogin);
  $("themeToggleBtn").addEventListener("click", toggleTheme);
  $("closeAdminLoginBtn").addEventListener("click", hideAdminLogin);
  $("adminLoginBtn").addEventListener("click", loginAdmin);
  $("adminLogoutBtn").addEventListener("click", logoutAdmin);
  $("patchBtn").addEventListener("click", showPatchNotes);
  $("closePatchBtn").addEventListener("click", hidePatchNotes);
  $("saveWebhookBtn").addEventListener("click", saveWebhook);
  $("saveEmbedBtn").addEventListener("click", saveEmbedSettings);
  $("sendOpenBtn").addEventListener("click", sendLotteryOpen);
  $("sendLockedBtn").addEventListener("click", sendEntriesLocked);
  $("sendResultBtn").addEventListener("click", sendDiscord);
  $("addPlayerBtn").addEventListener("click", addPlayer);
  $("removePlayerBtn").addEventListener("click", removePlayer);
  $("buildWheelBtn").addEventListener("click", buildWheel);
  $("lockEntriesBtn").addEventListener("click", toggleLockEntries);
  $("spinWheelBtn").addEventListener("click", spinWheel);
  $("clearAllBtn").addEventListener("click", clearAll);
  $("clearHistoryBtn").addEventListener("click", clearHistory);
}

function startApp() {
  cacheElements();
  loadTheme();

  el.adminLogin.style.display = "none";
  el.patchModal.style.display = "none";
  el.winnerCard.style.display = "none";

  bindEvents();
  loadPlayers();
  loadHistory();
  updatePlayersDisplay();
  updateHistoryDisplay();
  drawWheel();
  checkAdmin();
  setLockState();
}

startApp();
