/* =========================================================
   AI WORKSPACE — script.js
   ---------------------------------------------------------
   Ce fichier est responsable de tout ce qui est DYNAMIQUE :
     1) La navigation entre les modules (clic sur la barre laterale)
     2) La GENERATION en JS du contenu de chaque module dans la
        "zone principale" (#zone-principale) — sauf le Tableau
        de bord, qui reste ecrit en dur dans index.html.
     3) Le Chat, branche sur une vraie API : Google AI Studio
        (modeles Gemini).
     4) Les autres modules (Resume, Classification, Traduction,
        Prediction) : simules en JS, comme demande par l'enonce.
     5) L'Historique : sauvegarde locale (localStorage), recherche,
        suppression, vidange.

   Astuce : chaque "render...()" fait la meme chose
   qu'un composant. Il construit une chaine de caracteres HTML
   (template string) et la met dans element.innerHTML. C'est
   CA, "generer la page en JS".
   ========================================================= */

/* ---------------------------------------------------------
   0. CONFIGURATION
   --------------------------------------------------------- */
const CONFIG = {
  // Cle utilisee pour stocker la cle API OpenRouter dans le navigateur
  OPENROUTER_KEY_STORAGE: "aiworkspace_openrouter_api_key",
  // Cle utilisee pour stocker l'historique
  HISTORIQUE_STORAGE: "aiworkspace_historique",
  // Cle pour le theme (bonus)
  THEME_STORAGE: "aiworkspace_theme",
  // Modele OpenRouter. Liste dispo sur https://openrouter.ai/models
  // MiniMax M2.7(free): "minimax/m2.7b" ou "minimax/ministral-8b"...
  OPENROUTER_MODEL: "minimax/minimax-m2.7:free",
};

/* ---------------------------------------------------------
   1. PETITS UTILITAIRES
   --------------------------------------------------------- */
const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

function escapeHtml(str = "") {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatDate(date = new Date()) {
  return date.toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

/* ---------------------------------------------------------
   2. NAVIGATION — passer d'une vue a l'autre
   --------------------------------------------------------- */
function setupNav() {
  const links = $$(".nav-link");
  links.forEach((link) => {
    link.addEventListener("click", () => {
      const view = link.dataset.view;
      switchView(view);

      links.forEach((l) => l.classList.remove("active"));
      link.classList.add("active");
    });
  });
}

// Fait apparaitre la bonne <section class="view"> et cache les autres,
// et declenche la generation du contenu si necessaire.
function switchView(view) {
  $$(".view").forEach((section) => section.classList.remove("active"));
  const target = $(`#view-${view}`);
  if (!target) return;
  target.classList.add("active");

  // Genere le contenu au premier affichage (ou le regenere a chaque fois
  // pour l'historique, qui doit rester a jour)
  switch (view) {
    case "chat":
      if (!target.dataset.rendered) renderChat(target);
      break;
    case "resume":
      if (!target.dataset.rendered) renderResume(target);
      break;
    case "classification":
      if (!target.dataset.rendered) renderClassification(target);
      break;
    case "traduction":
      if (!target.dataset.rendered) renderTraduction(target);
      break;
    case "prediction":
      if (!target.dataset.rendered) renderPrediction(target);
      break;
    case "historique":
      renderHistoriqueView(target); // toujours regenere pour etre a jour
      break;
    default:
      break; // dashboard = statique, rien a faire
  }
}

/* ---------------------------------------------------------
   3. HISTORIQUE (localStorage) — Partie 7 de l'enonce
   --------------------------------------------------------- */
function getHistorique() {
  const raw = localStorage.getItem(CONFIG.HISTORIQUE_STORAGE);
  return raw ? JSON.parse(raw) : [];
}

function saveHistorique(list) {
  localStorage.setItem(CONFIG.HISTORIQUE_STORAGE, JSON.stringify(list));
}

// service: "Chat" | "Resume de texte" | "Classification" | "Traduction" | "Prediction"
function addHistorique(service, requete, reponse) {
  const list = getHistorique();
  list.unshift({
    id: Date.now() + Math.random().toString(16).slice(2),
    service,
    requete,
    reponse,
    date: formatDate(),
  });
  saveHistorique(list);
}

function deleteHistoriqueEntry(id) {
  saveHistorique(getHistorique().filter((item) => item.id !== id));
}

function clearHistorique() {
  saveHistorique([]);
}

/* ---------------------------------------------------------
   4. VUE : CHAT — connecte a OpenRouter (MiniMax)
   --------------------------------------------------------- */
function renderChat(container) {
  container.dataset.rendered = "true";

  const savedKey = localStorage.getItem(CONFIG.OPENROUTER_KEY_STORAGE) || "";

  container.innerHTML = `
    <h1 class="view__title">Chat IA</h1>
    <p class="view__subtitle">Discute avec un modele IA via OpenRouter.</p>

    <div class="chat-shell">
      <div class="chat-config">
        <span>Cle API OpenRouter :</span>
        <input type="password" id="openrouter-key-input" placeholder="Colle ta cle API OpenRouter ici" value="${escapeHtml(savedKey)}">
        <button class="btn-secondary" id="save-key-btn">Enregistrer</button>
      </div>

      <div class="chat-window" id="chat-window">
        <div class="chat-msg chat-msg--bot">Bonjour ! Pose-moi une question pour commencer la discussion.</div>
      </div>

      <div class="chat-input-row">
        <textarea id="chat-input" placeholder="Ecris ton message... (Entree pour envoyer, Maj+Entree pour une nouvelle ligne)"></textarea>
        <button class="btn-primary" id="chat-send-btn">Envoyer</button>
      </div>
    </div>
  `;

  const keyInput = $("#openrouter-key-input", container);
  const saveKeyBtn = $("#save-key-btn", container);
  const chatWindow = $("#chat-window", container);
  const chatInput = $("#chat-input", container);
  const sendBtn = $("#chat-send-btn", container);

  saveKeyBtn.addEventListener("click", () => {
    localStorage.setItem(CONFIG.OPENROUTER_KEY_STORAGE, keyInput.value.trim());
    saveKeyBtn.textContent = "Enregistre !";
    setTimeout(() => (saveKeyBtn.textContent = "Enregistrer"), 1200);
  });

  function appendMessage(role, text) {
    const bubble = document.createElement("div");
    bubble.className =
      "chat-msg " +
      (role === "user" ? "chat-msg--user" : role === "error" ? "chat-msg--error" : "chat-msg--bot");
    bubble.textContent = text;
    chatWindow.appendChild(bubble);
    chatWindow.scrollTop = chatWindow.scrollHeight;
    return bubble;
  }

  async function handleSend() {
    const message = chatInput.value.trim();
    const apiKey = localStorage.getItem(CONFIG.OPENROUTER_KEY_STORAGE);

    if (!message) return;
    if (!apiKey) {
      appendMessage("error", "Merci de renseigner d'abord ta cle API OpenRouter ci-dessus.");
      return;
    }

    appendMessage("user", message);
    chatInput.value = "";
    sendBtn.disabled = true;

    const typingBubble = document.createElement("div");
    typingBubble.className = "chat-msg chat-msg--typing";
    typingBubble.textContent = "Le modele redige une reponse...";
    chatWindow.appendChild(typingBubble);
    chatWindow.scrollTop = chatWindow.scrollHeight;

    try {
      const reply = await callOpenRouterAPI(apiKey, message);
      typingBubble.remove();
      appendMessage("bot", reply);
      addHistorique("Chat", message, reply);
    } catch (err) {
      typingBubble.remove();
      appendMessage("error", "Erreur : " + err.message);
    } finally {
      sendBtn.disabled = false;
    }
  }

  sendBtn.addEventListener("click", handleSend);
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });
}

// Appel reel a l'API OpenRouter.
// Doc : https://openrouter.ai/docs
async function callOpenRouterAPI(apiKey, message) {
  const url = "https://openrouter.ai/api/v1/chat/completions";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: CONFIG.OPENROUTER_MODEL,
      messages: [
        { role: "user", content: message },
      ],
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData?.error?.message || `Code ${response.status}`;
    if (response.status === 401) throw new Error("Cle API refusee. Verifie ta cle OpenRouter.");
    if (response.status === 429) throw new Error("Quota depasse. Reessaie plus tard.");
    throw new Error(`Erreur ${response.status}: ${errorMessage}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Reponse vide ou bloquee par les filtres.");
  return text;
}

/* ---------------------------------------------------------
   5. VUE : RESUME DE TEXTE (simule) — Partie 3
   --------------------------------------------------------- */
function renderResume(container) {
  container.dataset.rendered = "true";

  container.innerHTML = `
    <h1 class="view__title">Resume de texte</h1>
    <p class="view__subtitle">Service simule en JavaScript (a brancher plus tard sur une vraie API).</p>

    <div class="form-block">
      <div class="field">
        <label for="resume-input">Texte a resumer</label>
        <textarea id="resume-input" placeholder="Colle ou ecris ton texte ici..."></textarea>
      </div>
      <button class="btn-primary" id="resume-btn">Resumer</button>
      <div class="field">
        <label>Resume</label>
        <div class="result-box empty" id="resume-output">Le resume s'affichera ici.</div>
      </div>
    </div>
  `;

  $("#resume-btn", container).addEventListener("click", () => {
    const input = $("#resume-input", container).value.trim();
    const output = $("#resume-output", container);
    if (!input) {
      output.textContent = "Merci de saisir un texte a resumer.";
      output.classList.add("empty");
      return;
    }
    const resume = simulateResume(input);
    output.textContent = resume;
    output.classList.remove("empty");
    addHistorique("Resume de texte", input, resume);
  });
}

// Simulation simple : garde la premiere phrase + compte les mots
function simulateResume(text) {
  const firstSentence = text.split(/(?<=[.!?])\s/)[0] || text;
  const wordCount = text.trim().split(/\s+/).length;
  return `${firstSentence.trim()} [...] (resume simule : ${wordCount} mots analyses, condenses en une phrase cle)`;
}

/* ---------------------------------------------------------
   6. VUE : CLASSIFICATION (simulee)
   --------------------------------------------------------- */
function renderClassification(container) {
  container.dataset.rendered = "true";

  container.innerHTML = `
    <h1 class="view__title">Classification</h1>
    <p class="view__subtitle">Detection de sentiment simulee en JavaScript.</p>

    <div class="form-block">
      <div class="field">
        <label for="classif-input">Texte a analyser</label>
        <textarea id="classif-input" placeholder="Ex : Ce produit est vraiment excellent !"></textarea>
      </div>
      <button class="btn-primary" id="classif-btn">Classifier</button>
      <div class="field">
        <label>Resultat</label>
        <div class="result-box empty" id="classif-output">Le resultat s'affichera ici.</div>
      </div>
    </div>
  `;

  $("#classif-btn", container).addEventListener("click", () => {
    const input = $("#classif-input", container).value.trim();
    const output = $("#classif-output", container);
    if (!input) {
      output.textContent = "Merci de saisir un texte a classifier.";
      output.classList.add("empty");
      return;
    }
    const result = simulateClassification(input);
    output.innerHTML = `<span class="badge">${result.label}</span>  &nbsp; confiance simulee : ${result.score}%`;
    output.classList.remove("empty");
    addHistorique("Classification", input, `${result.label} (${result.score}%)`);
  });
}

// Simulation basique par mots-cles
function simulateClassification(text) {
  const positive = ["super", "excellent", "genial", "bien", "top", "aime", "content", "bravo"];
  const negative = ["nul", "mauvais", "deteste", "horrible", "probleme", "decu", "triste"];
  const lower = text.toLowerCase();

  let score = 0;
  positive.forEach((w) => { if (lower.includes(w)) score++; });
  negative.forEach((w) => { if (lower.includes(w)) score--; });

  if (score > 0) return { label: "Positif", score: Math.min(60 + score * 10, 98) };
  if (score < 0) return { label: "Negatif", score: Math.min(60 + Math.abs(score) * 10, 98) };
  return { label: "Neutre", score: 50 + Math.floor(Math.random() * 15) };
}

/* ---------------------------------------------------------
   7. VUE : LA TRADUCTION (simulee) — Partie 4
   --------------------------------------------------------- */
function renderTraduction(container) {
  container.dataset.rendered = "true";

  container.innerHTML = `
    <h1 class="view__title">Traduction</h1>
    <p class="view__subtitle">Traduction simulee en JavaScript.</p>

    <div class="form-block">
      <div class="field">
        <label for="trad-input">Texte a traduire</label>
        <textarea id="trad-input" placeholder="Ecris ton texte en francais..."></textarea>
      </div>
      <div class="field">
        <label for="trad-lang">Langue cible</label>
        <select id="trad-lang">
          <option value="en">Anglais</option>
          <option value="es">Espagnol</option>
          <option value="de">Allemand</option>
          <option value="ar">Arabe</option>
        </select>
      </div>
      <button class="btn-primary" id="trad-btn">Traduire</button>
      <div class="field">
        <label>Traduction</label>
        <div class="result-box empty" id="trad-output">La traduction s'affichera ici.</div>
      </div>
    </div>
  `;

  $("#trad-btn", container).addEventListener("click", () => {
    const input = $("#trad-input", container).value.trim();
    const lang = $("#trad-lang", container).value;
    const output = $("#trad-output", container);
    if (!input) {
      output.textContent = "Merci de saisir un texte a traduire.";
      output.classList.add("empty");
      return;
    }
    const result = simulateTraduction(input, lang);
    output.textContent = result;
    output.classList.remove("empty");
    addHistorique("Traduction", `${input} -> ${lang}`, result);
  });
}

function simulateTraduction(text, lang) {
  const labels = { en: "Anglais", es: "Espagnol", de: "Allemand", ar: "Arabe" };
  return `[Traduction simulee en ${labels[lang]}] ${text}`;
}

/* ---------------------------------------------------------
   8. VUE : PREDICTION (fictive) — Partie 6
   --------------------------------------------------------- */
function renderPrediction(container) {
  container.dataset.rendered = "true";

  container.innerHTML = `
    <h1 class="view__title">Prediction</h1>
    <p class="view__subtitle">Prediction fictive, calculee localement en JavaScript.</p>

    <div class="form-block">
      <div class="field-row">
        <div class="field">
          <label for="pred-age">Age</label>
          <input type="number" id="pred-age" placeholder="30" min="0">
        </div>
        <div class="field">
          <label for="pred-revenu">Revenu mensuel (EUR)</label>
          <input type="number" id="pred-revenu" placeholder="2500" min="0">
        </div>
        <div class="field">
          <label for="pred-ville">Ville</label>
          <input type="text" id="pred-ville" placeholder="Dakar">
        </div>
      </div>
      <button class="btn-primary" id="pred-btn">Predire</button>
      <div class="field">
        <label>Resultat de la prediction</label>
        <div class="result-box empty" id="pred-output">Le resultat s'affichera ici.</div>
      </div>
    </div>
  `;

  $("#pred-btn", container).addEventListener("click", () => {
    const age = $("#pred-age", container).value;
    const revenu = $("#pred-revenu", container).value;
    const ville = $("#pred-ville", container).value.trim();
    const output = $("#pred-output", container);

    if (!age || !revenu || !ville) {
      output.textContent = "Merci de remplir l'age, le revenu et la ville.";
      output.classList.add("empty");
      return;
    }

    const result = simulatePrediction(Number(age), Number(revenu), ville);
    output.textContent = result;
    output.classList.remove("empty");
    addHistorique("Prediction", `age=${age}, revenu=${revenu}, ville=${ville}`, result);
  });
}

function simulatePrediction(age, revenu, ville) {
  let profil = "Standard";
  if (revenu > 4000) profil = "Premium";
  else if (revenu < 1200) profil = "Economique";

  let segment = age < 25 ? "jeune actif" : age < 55 ? "actif confirme" : "senior";

  return `Profil predit (fictif) : ${profil} — segment "${segment}" — score d'affinite avec ${ville} : ${Math.floor(50 + Math.random() * 45)}%.`;
}

/* ---------------------------------------------------------
   9. VUE : HISTORIQUE — Partie 7
   --------------------------------------------------------- */
function renderHistoriqueView(container) {
  const list = getHistorique();

  container.innerHTML = `
    <h1 class="view__title">Historique</h1>
    <p class="view__subtitle">Toutes tes requetes, enregistrees localement dans ton navigateur.</p>

    <div class="historique-toolbar">
      <input type="search" id="hist-search" placeholder="Rechercher dans l'historique...">
      <button class="btn-secondary" id="hist-export">Exporter en CSV</button>
      <button class="btn-secondary" id="hist-clear">Vider l'historique</button>
    </div>

    <div class="card">
      <table class="data-table">
        <thead>
          <tr><th>Date</th><th>Service</th><th>Requete</th><th>Reponse</th><th></th></tr>
        </thead>
        <tbody id="hist-body"></tbody>
      </table>
      <div id="hist-empty" class="empty-state" style="display:none;">Aucun element dans l'historique pour le moment.</div>
    </div>
  `;

  const searchInput = $("#hist-search", container);
  const clearBtn = $("#hist-clear", container);
  const exportBtn = $("#hist-export", container);

  function paint(filter = "") {
    const body = $("#hist-body", container);
    const emptyState = $("#hist-empty", container);
    const current = getHistorique().filter((item) => {
      const haystack = `${item.service} ${item.requete} ${item.reponse}`.toLowerCase();
      return haystack.includes(filter.toLowerCase());
    });

    if (current.length === 0) {
      body.innerHTML = "";
      emptyState.style.display = "block";
      return;
    }
    emptyState.style.display = "none";

    body.innerHTML = current
      .map(
        (item) => `
        <tr data-id="${item.id}">
          <td>${item.date}</td>
          <td><span class="badge">${escapeHtml(item.service)}</span></td>
          <td>${escapeHtml(String(item.requete)).slice(0, 60)}</td>
          <td>${escapeHtml(String(item.reponse)).slice(0, 60)}</td>
          <td class="row-actions"><button data-delete="${item.id}">Supprimer</button></td>
        </tr>`
      )
      .join("");

    $$("button[data-delete]", body).forEach((btn) => {
      btn.addEventListener("click", () => {
        deleteHistoriqueEntry(btn.dataset.delete);
        paint(searchInput.value);
      });
    });
  }

  searchInput.addEventListener("input", () => paint(searchInput.value));

  clearBtn.addEventListener("click", () => {
    if (confirm("Vider tout l'historique ? Cette action est irreversible.")) {
      clearHistorique();
      paint();
    }
  });

  exportBtn.addEventListener("click", () => {
    const rows = getHistorique();
    if (rows.length === 0) return;
    const csv = [
      "Date;Service;Requete;Reponse",
      ...rows.map((r) => [r.date, r.service, r.requete, r.reponse].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "historique-ai-workspace.csv";
    link.click();
  });

  paint();
}

/* ---------------------------------------------------------
   10. BONUS : theme clair / sombre, persistant
   --------------------------------------------------------- */
function setupTheme() {
  const toggle = $("#theme-toggle");
  const saved = localStorage.getItem(CONFIG.THEME_STORAGE);
  if (saved === "dark") document.body.classList.add("dark");

  toggle.addEventListener("click", () => {
    document.body.classList.toggle("dark");
    localStorage.setItem(CONFIG.THEME_STORAGE, document.body.classList.contains("dark") ? "dark" : "light");
  });
}

/* ---------------------------------------------------------
   11. INITIALISATION
   --------------------------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  setupNav();
  setupTheme();
});
