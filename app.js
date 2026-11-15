//Drawer Toggle
const sideTaskbar = document.getElementById("sideTaskbar");
const drawerBackdrop = document.getElementById("drawerBackdrop");
function toggleTaskbar() {
  sideTaskbar.classList.toggle("open");
  drawerBackdrop.classList.toggle("open");
}
document.getElementById("itemsBtn").addEventListener("click", toggleTaskbar);
document.getElementById("closeDrawerBtn").addEventListener("click", toggleTaskbar);
drawerBackdrop.addEventListener("click", toggleTaskbar);

// State
let currentSubject = "";
let currentChapter = "";
let activeQuestions = [];
let qIndex = 0, score = 0, attempted = 0, correct = 0;
let qSeconds = 0, totalSeconds = 0, timerInterval = null, answered = false;

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
  list.forEach(chap => {
    const row = document.createElement("div");
    row.className = "chapter-cell h-scroll";
    row.onclick = () => startPractice(chap.name);
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

async function startPractice(chapter) {
  currentChapter = chapter;
  document.getElementById("breadcrumb").innerHTML = `
    <button onclick="goHome()">Subjects</button> / 
    <button onclick="openSubject('${currentSubject}')">${currentSubject}</button> / 
    <span>${chapter}</span>
  `;

  switchView("view-practice");
  document.getElementById("qText").innerHTML = `Fetching <strong>${chapter}</strong> PYQs from Supabase...`;
  document.getElementById("optionsContainer").innerHTML = "";

  const cleanUrl = SUPABASE_URL.trim().replace(/\/$/, "");
  const cleanKey = SUPABASE_ANON_KEY.trim();

  try {
    const endpoint = `${cleanUrl}/rest/v1/questions?subject=eq.${encodeURIComponent(currentSubject)}&chapter=eq.${encodeURIComponent(chapter)}&select=*`;
    const res = await fetch(endpoint, {
      headers: { "apikey": cleanKey, "Authorization": `Bearer ${cleanKey}` }
    });
    const rows = await res.json();

    if (Array.isArray(rows) && rows.length > 0) {
      activeQuestions = rows.map(r => ({
        id: r.id,
        year: r.exam_year || "PYQ",
        text: r.question_text,
        image: r.image_url,
        options: typeof r.options === "string" ? JSON.parse(r.options) : r.options,
        answer: Number(r.correct_answer),
        solution: r.solution_steps
      }));
    } else {
      activeQuestions = [{
        year: "Empty Chapter",
        text: `Connected to Supabase! No questions uploaded for <strong>${chapter}</strong> yet.`,
        options: ["Option A", "Option B", "Option C", "Option D"],
        answer: 0
      }];
    }
  } catch (err) {
    activeQuestions = [{
      year: "Error",
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

function renderQuestion() {
  answered = false;
  qSeconds = 0;
  const q = activeQuestions[qIndex];
  document.getElementById("qNum").innerText = qIndex + 1;
  document.getElementById("qTotal").innerText = activeQuestions.length;
  document.getElementById("qMetaTag").innerText = `${currentSubject} • ${currentChapter} • ${q.year}`;
  document.getElementById("qText").innerHTML = q.text + (q.image ? `<br><img src="${q.image}" style="max-width:100%;margin-top:12px;border-radius:8px;">` : "");

  const container = document.getElementById("optionsContainer");
  container.innerHTML = "";
  q.options.forEach((opt, idx) => {
    const btn = document.createElement("button");
    btn.className = "option-btn";
    btn.innerHTML = `<strong>(${String.fromCharCode(65 + idx)})</strong> <span>${opt}</span>`;
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
  qIndex = (qIndex + 1) % activeQuestions.length;
  renderQuestion();
}