// Drawer Toggle
const sideTaskbar = document.getElementById("sideTaskbar");
const drawerBackdrop = document.getElementById("drawerBackdrop");
function toggleTaskbar() {
  sideTaskbar.classList.toggle("open");
  drawerBackdrop.classList.toggle("open");
}
document.getElementById("itemsBtn").addEventListener("click", toggleTaskbar);
document.getElementById("closeDrawerBtn").addEventListener("click", toggleTaskbar);
drawerBackdrop.addEventListener("click", toggleTaskbar);

// State & Cache
let currentSubject = "";
let currentChapter = "";
let activeQuestions = [];
let subjectCache = {}; // Caches fetched questions per subject for instant chapter switching
let qIndex = 0, score = 0, attempted = 0, correct = 0;
let qSeconds = 0, totalSeconds = 0, timerInterval = null, answered = false;

// Maps syllabus.js chapter names -> possible Hugging Face chapter tags in Supabase
const DB_CHAPTER_ALIASES = {
  "Units and Measurements": ["Units and Measurements", "Units & Measurements", "Physics and Measurement", "Measurement"],
  "Work, Energy and Power": ["Work, Energy and Power", "Work Energy and Power", "Work, Power and Energy"],
  "Electronic Devices": ["Electronic Devices", "electronic device", "Semiconductors", "Semiconductor"],
  "Optics (Ray & Wave)": ["Optics (Ray & Wave)", "Optics", "Ray Optics", "Wave Optics"],
  "Magnetic Effects of Current and Magnetism": ["Magnetic Effects of Current and Magnetism", "Magnetism", "Magnetic Effect"],
  "Electromagnetic Induction and Alternating Currents": ["Electromagnetic Induction and Alternating Currents", "Electromagnetic Induction", "Alternating Current", "EMI"],
  "Properties of Solids and Liquids": ["Properties of Solids and Liquids", "Fluid Mechanics", "Properties of Matter", "Elasticity"],
  "Dual Nature of Matter and Radiation": ["Dual Nature of Matter and Radiation", "Dual Nature", "Modern Physics"],
  "Atoms and Nuclei": ["Atoms and Nuclei", "Modern Physics", "Atomic Physics", "Nuclear Physics"],
  "Oscillations and Waves": ["Oscillations and Waves", "Oscillations", "Waves", "SHM"],
  // Chemistry broad tags fallback
  "Some Basic Concepts in Chemistry": ["Some Basic Concepts in Chemistry", "Mole Concept", "Physical Chemistry"],
  "Atomic Structure": ["Atomic Structure", "Structure of Atom", "Physical Chemistry"],
  "Chemical Thermodynamics": ["Chemical Thermodynamics", "Thermodynamics", "Physical Chemistry"],
  "Solutions": ["Solutions", "Solution", "Physical Chemistry"],
  "Equilibrium": ["Equilibrium", "Chemical Equilibrium", "Ionic Equilibrium", "Physical Chemistry"],
  "Redox Reactions and Electrochemistry": ["Redox Reactions and Electrochemistry", "Electrochemistry", "Redox", "Physical Chemistry"],
  "Chemical Kinetics": ["Chemical Kinetics", "Physical Chemistry"],
  "Chemical Bonding and Molecular Structure": ["Chemical Bonding and Molecular Structure", "Chemical Bonding", "Inorganic Chemistry"],
  "Classification of Elements and Periodicity": ["Classification of Elements and Periodicity", "Periodic Table", "Periodicity", "Inorganic Chemistry"],
  "p-Block Elements": ["p-Block Elements", "p-Block", "Inorganic Chemistry"],
  "d- and f-Block Elements": ["d- and f-Block Elements", "d and f Block", "Coordination", "Inorganic Chemistry"],
  "Coordination Compounds": ["Coordination Compounds", "Inorganic Chemistry"],
  "Some Basic Principles of Organic Chemistry (GOC)": ["Some Basic Principles of Organic Chemistry (GOC)", "General Organic Chemistry", "GOC", "Organic Chemistry"],
  "Hydrocarbons": ["Hydrocarbons", "Organic Chemistry"],
  "Organic Compounds Containing Halogens": ["Organic Compounds Containing Halogens", "Haloalkanes", "Organic Chemistry"],
  "Organic Compounds Containing Oxygen": ["Organic Compounds Containing Oxygen", "Alcohols", "Aldehydes", "Organic Chemistry"],
  "Organic Compounds Containing Nitrogen": ["Organic Compounds Containing Nitrogen", "Amines", "Organic Chemistry"],
  "Biomolecules": ["Biomolecules", "Organic Chemistry"],
  // Math aliases
  "Sets, Relations and Functions": ["Sets, Relations and Functions", "Functions", "Sets and Relations", "Calculus"],
  "Complex Numbers and Quadratic Equations": ["Complex Numbers and Quadratic Equations", "Complex Numbers", "Quadratic Equations", "Algebra"],
  "Limit, Continuity and Differentiability": ["Limit, Continuity and Differentiability", "Limits", "Continuity", "Differentiability", "Differential Calculus"],
  "Integral Calculus": ["Integral Calculus", "Integration", "Definite Integration", "Indefinite Integration"],
  "Co-ordinate Geometry": ["Co-ordinate Geometry", "Coordinate Geometry", "Straight Lines", "Circles", "Conic Sections"],
  "Three Dimensional Geometry": ["Three Dimensional Geometry", "3D Geometry", "Vector and 3D"],
  "Statistics and Probability": ["Statistics and Probability", "Probability", "Statistics"]
};

function switchView(viewId) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById(viewId).classList.add("active");
}

function goHome() {
  clearInterval(timerInterval);
  document.getElementById("breadcrumb").innerHTML = "Select a Subject";
  switchView("view-subjects");
}

function openSubject(subject) {
  clearInterval(timerInterval);
  currentSubject = subject;
  document.getElementById("selectedSubjectTitle").innerText = `${subject} Chapters`;
  document.getElementById("chapterSearch").value = "";
  document.getElementById("breadcrumb").innerHTML = `<button onclick="goHome()">Subjects</button> / <span>${subject}</span>`;
  renderChapters(SYLLABUS[subject]);
  switchView("view-chapters");
}

function renderChapters(list) {
  const container = document.getElementById("chapterList");
  container.innerHTML = "";

  const allRow = document.createElement("div");
  allRow.className = "chapter-cell h-scroll";
  allRow.onclick = () => startPractice(`All ${currentSubject} PYQs`, true);
  allRow.innerHTML = `
    <div class="chap-left">
      <span class="chap-name">All ${currentSubject} PYQs (Mixed Practice)</span>
      <span class="chap-tag">Full Subject Question Bank</span>
    </div>
    <div class="cell-arrow">→</div>
  `;
  container.appendChild(allRow);

  list.forEach(chap => {
    const row = document.createElement("div");
    row.className = "chapter-cell h-scroll";
    row.onclick = () => startPractice(chap.name, false);
    row.innerHTML = `
      <div class="chap-left">
        <span class="chap-name">${chap.name}</span>
        <span class="chap-tag">${chap.class}</span>
      </div>
      <div class="cell-arrow">→</div>
    `;
    container.appendChild(row);
  });
}

function filterChapters() {
  const q = document.getElementById("chapterSearch").value.toLowerCase();
  renderChapters(SYLLABUS[currentSubject].filter(c => c.name.toLowerCase().includes(q)));
}

// Normalizes punctuation/case so "Work, Energy and Power" matches "Work Energy & Power"
function normalizeText(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function startPractice(chapter, fetchAll = false) {
  currentChapter = chapter;
  document.getElementById("breadcrumb").innerHTML = `
    <button onclick="goHome()">Subjects</button> / 
    <button onclick="openSubject('${currentSubject}')">${currentSubject}</button> / 
    <span>${chapter}</span>
  `;

  switchView("view-practice");
  document.getElementById("qText").innerHTML = `Fetching <strong>${chapter}</strong> PYQs from Supabase...`;
  document.getElementById("optionsContainer").innerHTML = "";

  if (typeof SUPABASE_URL === "undefined" || typeof SUPABASE_ANON_KEY === "undefined") {
    document.getElementById("qText").innerHTML = "Configuration error: <code>config.js</code> failed to load. Check GitHub Actions deployment.";
    return;
  }

  const cleanUrl = SUPABASE_URL.trim().replace(/\/$/, "");
  const cleanKey = SUPABASE_ANON_KEY.trim();

  try {
    // Fetch subject rows once and cache in memory (avoids PostgREST comma/symbol URL bugs)
    if (!subjectCache[currentSubject]) {
      const endpoint = `${cleanUrl}/rest/v1/questions?subject=eq.${encodeURIComponent(currentSubject)}&select=*`;
      const res = await fetch(endpoint, {
        headers: { "apikey": cleanKey, "Authorization": `Bearer ${cleanKey}` }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} (${res.statusText})`);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error("Invalid response format from Supabase");
      subjectCache[currentSubject] = data;
    }

    let rows = subjectCache[currentSubject];

    if (!fetchAll) {
      const aliases = DB_CHAPTER_ALIASES[chapter] || [chapter];
      const shortCore = chapter.replace(/s$/i, "").split("(")[0].trim();
      const targetTerms = [...new Set([...aliases, shortCore])]
        .map(normalizeText)
        .filter(Boolean);

      rows = rows.filter(r => {
        const dbChap = normalizeText(r.chapter);
        return targetTerms.some(term => dbChap.includes(term) || term.includes(dbChap));
      });
    }

    if (rows.length > 0) {
      activeQuestions = rows.map(r => ({
        id: r.id,
        year: r.exam_year || "PYQ",
        dbChapter: r.chapter || chapter,
        text: r.question_text,
        image: r.image_url,
        options: typeof r.options === "string" ? JSON.parse(r.options) : r.options,
        answer: Number(r.correct_answer),
        solution: r.solution_steps
      }));
    } else {
      activeQuestions = [{
        year: "Empty Chapter",
        dbChapter: chapter,
        text: `Connected to Supabase! No questions found matching <strong>${chapter}</strong> yet. Try <strong>All ${currentSubject} PYQs</strong> at the top of the chapter list.`,
        options: ["Option A", "Option B", "Option C", "Option D"],
        answer: 0
      }];
    }
  } catch (err) {
    activeQuestions = [{
      year: "Error",
      dbChapter: chapter,
      text: `Supabase connection error: <code>${err.message}</code>`,
      options: ["Retry", "-", "-", "-"],
      answer: 0
    }];
  }

  qIndex = 0; score = 0; attempted = 0; correct = 0; qSeconds = 0; totalSeconds = 0;
  updateStatsUI();

  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    totalSeconds++;
    if (!answered) qSeconds++;
    document.getElementById("qTimeVal").innerText = `${qSeconds}s`;
    document.getElementById("totTimeVal").innerText =
      `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
  }, 1000);

  renderQuestion();
}

function attachImageFallbacks(rootEl) {
  rootEl.querySelectorAll("img").forEach(img => {
    img.onerror = () => {
      const note = document.createElement("span");
      note.style.cssText = "display:inline-block;padding:4px 8px;margin:6px 0;font-size:0.85em;background:rgba(255,255,255,0.08);border-radius:4px;color:#aaa;";
      note.innerText = "[Diagram unavailable in text dataset]";
      img.replaceWith(note);
    };
  });
}

function renderQuestion() {
  if (!activeQuestions || activeQuestions.length === 0) return;
  answered = false;
  qSeconds = 0;
  const q = activeQuestions[qIndex];
  document.getElementById("qNum").innerText = qIndex + 1;
  document.getElementById("qTotal").innerText = activeQuestions.length;
  document.getElementById("qMetaTag").innerText = `${currentSubject} • ${q.dbChapter || currentChapter} • ${q.year}`;

  const qTextEl = document.getElementById("qText");
  qTextEl.innerHTML = q.text + (q.image ? `<br><img src="${q.image}" style="max-width:100%;margin-top:12px;border-radius:8px;">` : "");
  attachImageFallbacks(qTextEl);

  const container = document.getElementById("optionsContainer");
  container.innerHTML = "";
  q.options.forEach((opt, idx) => {
    const btn = document.createElement("button");
    btn.className = "option-btn";
    btn.innerHTML = `<strong>(${String.fromCharCode(65 + idx)})</strong> <span>${opt}</span>`;
    attachImageFallbacks(btn);
    btn.onclick = () => selectOption(idx, btn);
    container.appendChild(btn);
  });

  if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise();
}

function selectOption(chosenIdx, btn) {
  if (answered) return;
  answered = true;
  attempted++;
  const correctIdx = activeQuestions[qIndex].answer;
  const buttons = document.querySelectorAll(".option-btn");
  buttons.forEach(b => b.disabled = true);

  if (chosenIdx === correctIdx) {
    btn.classList.add("correct");
    score += 4;
    correct++;
  } else {
    btn.classList.add("wrong");
    if (buttons[correctIdx]) buttons[correctIdx].classList.add("correct");
    score -= 1;
  }
  updateStatsUI();
}

function updateStatsUI() {
  document.getElementById("scoreVal").innerText = score;
  document.getElementById("accVal").innerText = `${attempted === 0 ? 0 : Math.round((correct / attempted) * 100)}%`;
}

function nextQuestion() {
  if (!activeQuestions || activeQuestions.length === 0) return;
  qIndex = (qIndex + 1) % activeQuestions.length;
  renderQuestion();
}