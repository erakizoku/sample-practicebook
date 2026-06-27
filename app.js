"use strict";

const config = window.QUIZ_APP_CONFIG || {};
const state = {
  menus: [],
  questions: [],
  activeMenu: null,
  quizQuestions: [],
  current: 0,
  selected: new Set(),
  answers: []
};

const $ = (selector) => document.querySelector(selector);

document.addEventListener("DOMContentLoaded", init);

async function init() {
  $("#appTitle").textContent = config.title || "Quiz Studio";
  bindEvents();
  renderHomeStats();

  try {
    const [menuCsv, questionCsv] = await Promise.all([
      fetchText(config.menuCsvUrl),
      fetchText(config.questionsCsvUrl)
    ]);
    state.menus = parseCsv(menuCsv).map(normalizeMenu).filter(Boolean);
    state.questions = parseCsv(questionCsv).map(normalizeQuestion).filter(Boolean);
    $("#loadStatus").textContent = state.questions.length + "問を読み込みました。";
    renderCategories();
  } catch (error) {
    $("#loadStatus").textContent = "データの読み込みに失敗しました。";
    console.error(error);
  }
}

function bindEvents() {
  $("#resetHistoryButton").onclick = resetHistory;
  $("#quitQuizButton").onclick = () => showScreen("homeScreen");
  $("#submitAnswerButton").onclick = submitAnswer;
  $("#nextQuestionButton").onclick = nextQuestion;
  $("#retryButton").onclick = () => startQuiz(state.activeMenu);
  document.querySelectorAll("[data-go]").forEach((button) => {
    button.onclick = () => showScreen(button.dataset.go);
  });
}

async function fetchText(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(url);
  return response.text();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  if (rows.length < 2) return [];

  const headers = rows[0].map(clean);
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, clean(values[index] || "")])));
}

function clean(value) {
  return String(value || "").trim().replace(/^\uFEFF/, "");
}

function pick(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== "") return row[key];
  }
  return "";
}

function splitValue(value) {
  return clean(value).split(",").map(clean).filter(Boolean);
}

function toNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function normalizeMenu(row) {
  const sectionid = pick(row, ["sectionid", "sectionId", "categoryId", "カテゴリーID", "カテゴリID", "menuId"]);
  const categoryName = pick(row, ["categoryName", "カテゴリー名", "カテゴリ名", "name"]);
  const questionCategoryid = pick(row, ["questionCategoryid", "questionCategoryId", "questionCategory", "出題問題カテゴリー", "問題カテゴリー", "出題カテゴリ"]);
  const questionCount = toNumber(pick(row, ["questionCount", "出題数"]), 10);
  const passingScore = toNumber(pick(row, ["passingScore", "合格基準", "合格正解数"]), questionCount);

  if (!sectionid || !categoryName || !questionCategoryid) return null;
  return {
    sectionid,
    categoryName,
    questionCategoryids: splitValue(questionCategoryid),
    questionCount,
    passingScore
  };
}

function normalizeQuestion(row) {
  const questionid = pick(row, ["questionid", "questionId", "no", "number", "問題ナンバー", "問題No", "ナンバー"]);
  const categoryId = pick(row, ["categoryId", "カテゴリーID", "問題カテゴリー", "カテゴリID"]);
  const question = pick(row, ["question", "問題文"]);
  const answerformat = pick(row, ["answerformat", "answerFormat", "回答形式"]);
  const correctAnswer = splitValue(pick(row, ["correctAnswer", "正解", "正解ナンバー"]));
  const explanation = pick(row, ["explanation", "解説"]);
  const answers = [1, 2, 3, 4]
    .map((number) => pick(row, ["answer" + number, "回答" + number]))
    .filter(Boolean)
    .map((text, index) => ({ originalIndex: String(index + 1), text }));

  if (!questionid || !categoryId || !question || answers.length < 2 || correctAnswer.length === 0) return null;
  return { questionid, categoryId, question, answerformat, answers, correctAnswer, explanation };
}

function renderCategories() {
  const list = $("#categoryList");
  list.innerHTML = "";
  state.menus.forEach((menu) => {
    const available = getQuestionsForMenu(menu).length;
    const button = document.createElement("button");
    button.className = "category-card";
    button.disabled = available === 0;
    button.innerHTML = '<span><strong>' + escapeHtml(menu.categoryName) + '</strong><small>' + available + '問中 ' + Math.min(menu.questionCount, available) + '問出題 / 合格 ' + menu.passingScore + '問</small></span><span class="card-arrow">›</span>';
    button.onclick = () => startQuiz(menu);
    list.appendChild(button);
  });
}

function startQuiz(menu) {
  state.activeMenu = menu;
  state.current = 0;
  state.selected = new Set();
  state.answers = [];
  const pool = getQuestionsForMenu(menu);
  const ordered = config.randomizeQuestions ? shuffle(pool) : pool;
  state.quizQuestions = ordered.slice(0, Math.min(menu.questionCount, ordered.length));
  $("#quizCategoryName").textContent = menu.categoryName;
  $("#questionTotal").textContent = state.quizQuestions.length;
  showScreen("quizScreen");
  renderQuestion();
}

function getQuestionsForMenu(menu) {
  return state.questions.filter((question) => menu.questionCategoryids.includes(question.categoryId));
}

function renderQuestion() {
  const question = state.quizQuestions[state.current];
  state.selected = new Set();
  $("#currentIndex").textContent = state.current + 1;
  $("#progressFill").style.width = (state.current / state.quizQuestions.length * 100) + "%";
  $("#questionNumber").textContent = "No. " + question.questionid;
  $("#questionText").textContent = question.question;
  $("#answerHint").textContent = getAnswerHint(question);
  $("#feedbackBox").classList.add("is-hidden");
  $("#feedbackBox").classList.remove("is-correct-feedback", "is-wrong-feedback");
  $("#submitAnswerButton").classList.remove("is-hidden");
  $("#nextQuestionButton").classList.add("is-hidden");

  const list = $("#answerList");
  list.innerHTML = "";
  const answers = config.randomizeAnswers ? shuffle(question.answers) : question.answers;
  answers.forEach((answer) => {
    const button = document.createElement("button");
    button.className = "answer-button";
    button.dataset.answer = answer.originalIndex;
    button.textContent = answer.text;
    button.onclick = () => toggleAnswer(button, question);
    list.appendChild(button);
  });
}

function getAnswerHint(question) {
  const format = clean(question.answerformat).toLowerCase();
  if (format === "truefalse" || format === "marubatsu" || format === "ox") return "正しいと思う方を選んでください。";
  if (format === "multiple" || question.correctAnswer.length > 1) return "正しいものをすべて選んでください。";
  return "正しいものを1つ選んでください。";
}

function toggleAnswer(button, question) {
  const answer = button.dataset.answer;
  const format = clean(question.answerformat).toLowerCase();
  const allowMultiple = format === "multiple" || question.correctAnswer.length > 1;
  if (!allowMultiple) {
    state.selected = new Set([answer]);
    document.querySelectorAll(".answer-button").forEach((item) => item.classList.remove("is-selected"));
    button.classList.add("is-selected");
    return;
  }

  if (state.selected.has(answer)) {
    state.selected.delete(answer);
    button.classList.remove("is-selected");
  } else {
    state.selected.add(answer);
    button.classList.add("is-selected");
  }
}

function submitAnswer() {
  if (!state.selected.size) return;
  const question = state.quizQuestions[state.current];
  const selected = [...state.selected].sort();
  const correct = [...question.correctAnswer].sort();
  const isCorrect = selected.join(",") === correct.join(",");
  state.answers.push({ question, selected, isCorrect });
  saveHistory(question.questionid, isCorrect);
  revealFeedback(question, isCorrect);
}

function revealFeedback(question, isCorrect) {
  document.querySelectorAll(".answer-button").forEach((button) => {
    const answer = button.dataset.answer;
    button.disabled = true;
    if (question.correctAnswer.includes(answer)) button.classList.add("is-correct");
    if (state.selected.has(answer) && !question.correctAnswer.includes(answer)) button.classList.add("is-wrong");
  });
  $("#feedbackTitle").textContent = isCorrect ? "正解です" : "不正解です";
  $("#feedbackBody").textContent = question.explanation || "正解: " + question.correctAnswer.join(", ");
  $("#feedbackBox").classList.toggle("is-correct-feedback", isCorrect);
  $("#feedbackBox").classList.toggle("is-wrong-feedback", !isCorrect);
  $("#feedbackBox").classList.remove("is-hidden");
  $("#submitAnswerButton").classList.add("is-hidden");
  $("#nextQuestionButton").textContent = state.current === state.quizQuestions.length - 1 ? "結果を見る" : "次へ";
  $("#nextQuestionButton").classList.remove("is-hidden");
}

function nextQuestion() {
  if (state.current < state.quizQuestions.length - 1) {
    state.current += 1;
    renderQuestion();
  } else {
    renderResult();
  }
}

function renderResult() {
  const correct = state.answers.filter((answer) => answer.isCorrect).length;
  const total = state.answers.length;
  const passed = correct >= state.activeMenu.passingScore;
  $("#passLabel").textContent = passed ? "合格" : "もう少し";
  $("#scoreText").innerHTML = '<span class="score-main">' + correct + '問正解</span><span class="score-sub">/' + total + '問中</span>';
  $("#resultMessage").textContent = state.activeMenu.passingScore + "問で合格";
  $("#resultCard").classList.toggle("is-pass", passed);

  const list = $("#reviewList");
  list.innerHTML = "";
  state.answers.forEach((answer) => {
    const item = document.createElement("details");
    item.className = "review-item";
    const detailHtml = answer.isCorrect
      ? '<p>' + escapeHtml(answer.question.explanation || "") + '</p>'
      : '<p><span class="review-label">選択</span>' + escapeHtml(getAnswerTexts(answer.question, answer.selected).join("、") || "未選択") + '</p><p><span class="review-label">正解</span>' + escapeHtml(getAnswerTexts(answer.question, answer.question.correctAnswer).join("、")) + '</p><p>' + escapeHtml(answer.question.explanation || "") + '</p>';
    item.innerHTML = '<summary><span>' + (answer.isCorrect ? "○" : "×") + '</span><strong>' + escapeHtml(answer.question.question) + '</strong></summary>' + detailHtml;
    list.appendChild(item);
  });
  renderHomeStats();
  showScreen("resultScreen");
}

function getAnswerTexts(question, answerIndexes) {
  return answerIndexes
    .map((index) => question.answers.find((answer) => answer.originalIndex === String(index))?.text || "")
    .filter(Boolean);
}

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((screen) => screen.classList.toggle("is-active", screen.id === id));
}

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(config.storageKey) || "{}"); } catch { return {}; }
}

function saveHistory(questionid, isCorrect) {
  const history = loadHistory();
  const record = history[questionid] || { answered: 0, correct: 0 };
  record.answered += 1;
  if (isCorrect) record.correct += 1;
  history[questionid] = record;
  localStorage.setItem(config.storageKey, JSON.stringify(history));
}

function resetHistory() {
  localStorage.removeItem(config.storageKey);
  renderHomeStats();
  $("#loadStatus").textContent = "この端末の履歴を消しました。";
}

function renderHomeStats() {
  const answeredEl = $("#totalAnswered");
  const accuracyEl = $("#totalAccuracy");
  if (!answeredEl || !accuracyEl) return;
  const values = Object.values(loadHistory());
  const answered = values.reduce((sum, item) => sum + item.answered, 0);
  const correct = values.reduce((sum, item) => sum + item.correct, 0);
  answeredEl.textContent = answered;
  accuracyEl.textContent = answered ? Math.round(correct / answered * 100) + "%" : "0%";
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }
  return copy;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}
