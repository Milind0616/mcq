// Quiz state is saved locally so a refresh can resume the current timed round.
const STORAGE_KEY = "mcq-practice-progress-v1";
const LETTERS = ["a", "b", "c", "d", "e"];
const BATCH_SIZE = 25;
const ROUND_TIME_MS = 15 * 60 * 1000;

const elements = {
  startScreen: document.querySelector("#start-screen"),
  quizScreen: document.querySelector("#quiz-screen"),
  resultScreen: document.querySelector("#result-screen"),
  reviewScreen: document.querySelector("#review-screen"),
  shuffleCheckbox: document.querySelector("#shuffle-checkbox"),
  startButton: document.querySelector("#start-button"),
  continueButton: document.querySelector("#continue-button"),
  resetButton: document.querySelector("#reset-quiz-button"),
  questionTotal: document.querySelector("#question-total"),
  correctCount: document.querySelector("#correct-count"),
  wrongCount: document.querySelector("#wrong-count"),
  attemptedCount: document.querySelector("#attempted-count"),
  questionNumber: document.querySelector("#question-number"),
  progressTrack: document.querySelector("#progress-track"),
  progressFill: document.querySelector("#progress-fill"),
  progressLabel: document.querySelector("#question-progress-label"),
  timer: document.querySelector("#timer"),
  questionText: document.querySelector("#question-text"),
  optionsList: document.querySelector("#options-list"),
  feedback: document.querySelector("#feedback"),
  feedbackMessage: document.querySelector("#feedback-message"),
  explanation: document.querySelector("#explanation"),
  submitButton: document.querySelector("#submit-button"),
  nextButton: document.querySelector("#next-button"),
  resultEyebrow: document.querySelector("#result-eyebrow"),
  resultTitle: document.querySelector("#result-title"),
  resultMessage: document.querySelector("#result-message"),
  finalScore: document.querySelector("#final-score"),
  finalPercentage: document.querySelector("#final-percentage"),
  finalCorrect: document.querySelector("#final-correct"),
  finalWrong: document.querySelector("#final-wrong"),
  finalAttempted: document.querySelector("#final-attempted"),
  overallSummary: document.querySelector("#overall-summary"),
  reviewButton: document.querySelector("#review-button"),
  nextRoundButton: document.querySelector("#next-round-button"),
  reviewList: document.querySelector("#review-list"),
  backToResultsButton: document.querySelector("#back-to-results-button")
};

let state = null;
let timerInterval = null;

function createQuestionOrder(shuffle) {
  const order = questions.map((_, index) => index);
  if (shuffle) {
    for (let index = order.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [order[index], order[randomIndex]] = [order[randomIndex], order[index]];
    }
  }
  return order;
}

function createState(shuffle) {
  return {
    order: createQuestionOrder(shuffle),
    shuffle,
    current: 0,
    selected: null,
    submitted: false,
    answers: {},
    batchDeadline: Date.now() + ROUND_TIME_MS,
    screen: "quiz",
    roundTimedOut: false,
    resultStart: 0,
    resultEnd: 0,
    reviewStart: 0,
    reviewEnd: 0,
    reviewReturnScreen: null
  };
}

function isValidState(value) {
  return value
    && Array.isArray(value.order)
    && value.order.length === questions.length
    && value.order.every((index) => Number.isInteger(index) && index >= 0 && index < questions.length)
    && new Set(value.order).size === questions.length
    && typeof value.shuffle === "boolean"
    && Number.isInteger(value.current)
    && value.current >= 0
    && value.current < questions.length
    && (value.selected === null || (Number.isInteger(value.selected) && value.selected >= 0 && value.selected < 5))
    && typeof value.submitted === "boolean"
    && value.answers
    && typeof value.answers === "object"
    && !Array.isArray(value.answers)
    && Number.isFinite(value.batchDeadline)
    && ["quiz", "result", "review"].includes(value.screen)
    && typeof value.roundTimedOut === "boolean"
    && Number.isInteger(value.resultStart)
    && Number.isInteger(value.resultEnd)
    && Number.isInteger(value.reviewStart)
    && Number.isInteger(value.reviewEnd);
}

function loadSavedState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    return isValidState(parsed) ? parsed : null;
  } catch (error) {
    console.warn("Could not read saved quiz progress.", error);
    return null;
  }
}

function saveProgress() {
  if (!state) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("Could not save quiz progress.", error);
  }
}

function getBatchRange(index) {
  const start = Math.floor(index / BATCH_SIZE) * BATCH_SIZE;
  return { start, end: Math.min(start + BATCH_SIZE, questions.length) };
}

function getCounts(start = 0, end = questions.length) {
  if (!state) return { correct: 0, wrong: 0, attempted: 0 };
  const values = state.order
    .slice(start, end)
    .map((questionIndex) => state.answers[String(questions[questionIndex].id)])
    .filter(Boolean);
  const correct = values.filter((answer) => answer.correct).length;
  return {
    correct,
    wrong: values.length - correct,
    attempted: values.length
  };
}

function updateScoreboard() {
  const counts = getCounts();
  elements.correctCount.textContent = counts.correct;
  elements.wrongCount.textContent = counts.wrong;
  elements.attemptedCount.textContent = counts.attempted;
}

function showScreen(screen) {
  elements.startScreen.hidden = screen !== "start";
  elements.quizScreen.hidden = screen !== "quiz";
  elements.resultScreen.hidden = screen !== "result";
  elements.reviewScreen.hidden = screen !== "review";
}

function startPractice(shuffle) {
  if (!questions.length) {
    elements.questionTotal.textContent = "Add questions to questions.js to begin.";
    return;
  }
  state = createState(shuffle);
  elements.resetButton.disabled = false;
  saveProgress();
  updateScoreboard();
  showScreen("quiz");
  loadQuestion();
  startTimer();
}

function loadQuestion() {
  if (!state || state.screen !== "quiz") return;
  if (Date.now() >= state.batchDeadline) {
    finishRound(true);
    return;
  }

  const question = questions[state.order[state.current]];
  const { start, end } = getBatchRange(state.current);
  const batchNumber = Math.floor(start / BATCH_SIZE) + 1;
  const batchCount = Math.ceil(questions.length / BATCH_SIZE);
  const batchPosition = state.current - start + 1;
  const percentage = Math.round(((state.current + 1) / questions.length) * 100);

  elements.questionNumber.textContent = `Question ${state.current + 1} of ${questions.length}`;
  elements.progressLabel.textContent = `Round ${batchNumber} of ${batchCount} · ${batchPosition} of ${end - start} this round`;
  elements.progressTrack.setAttribute("aria-valuenow", percentage);
  elements.progressFill.style.width = `${percentage}%`;
  elements.questionText.textContent = question.question;
  elements.optionsList.replaceChildren();
  elements.feedback.hidden = !state.submitted;

  question.options.forEach((option, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "option-card";
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", String(state.selected === index));
    button.disabled = state.submitted;
    if (state.selected === index) button.classList.add("is-selected");
    if (state.submitted && index === question.answer) button.classList.add("is-correct");
    if (state.submitted && index === state.selected && index !== question.answer) {
      button.classList.add("is-wrong");
    }
    const letter = document.createElement("span");
    letter.className = "option-letter";
    letter.textContent = `${LETTERS[index]})`;
    const text = document.createElement("span");
    text.textContent = option;
    button.append(letter, text);
    button.addEventListener("click", () => selectOption(index));
    elements.optionsList.append(button);
  });

  elements.submitButton.hidden = state.submitted;
  elements.submitButton.disabled = state.selected === null || state.submitted;
  elements.nextButton.hidden = !state.submitted;

  if (state.submitted) {
    const answer = state.answers[String(question.id)];
    const correctLabel = `${LETTERS[question.answer]}) ${question.options[question.answer]}`;
    elements.feedbackMessage.textContent = answer.correct
      ? "Correct!"
      : `Wrong! Correct answer: ${correctLabel}`;
    elements.feedbackMessage.className = `feedback-message ${answer.correct ? "is-correct" : "is-wrong"}`;
    elements.explanation.textContent = question.explanation || "";
    elements.explanation.hidden = !question.explanation;
  }
}

function selectOption(index) {
  if (!state || state.screen !== "quiz" || state.submitted) return;
  if (Date.now() >= state.batchDeadline) {
    finishRound(true);
    return;
  }
  state.selected = index;
  elements.submitButton.disabled = false;
  Array.from(elements.optionsList.children).forEach((option, optionIndex) => {
    const selected = index === optionIndex;
    option.classList.toggle("is-selected", selected);
    option.setAttribute("aria-checked", String(selected));
  });
  saveProgress();
}

function submitAnswer() {
  if (!state || state.screen !== "quiz" || state.submitted || state.selected === null) return;
  if (Date.now() >= state.batchDeadline) {
    finishRound(true);
    return;
  }
  const question = questions[state.order[state.current]];
  state.submitted = true;
  state.answers[String(question.id)] = {
    selected: state.selected,
    correct: state.selected === question.answer
  };
  saveProgress();
  updateScoreboard();
  loadQuestion();
}

function nextQuestion() {
  if (!state || state.screen !== "quiz" || !state.submitted) return;
  if (Date.now() >= state.batchDeadline) {
    finishRound(true);
    return;
  }
  const { end } = getBatchRange(state.current);
  if (state.current === end - 1) {
    finishRound(false);
    return;
  }
  state.current += 1;
  state.selected = null;
  state.submitted = false;
  saveProgress();
  loadQuestion();
}

function finishRound(timedOut) {
  if (!state || state.screen !== "quiz") return;
  stopTimer();
  const { start, end } = getBatchRange(state.current);

  if (timedOut) {
    for (let index = start; index < end; index += 1) {
      const question = questions[state.order[index]];
      const answerKey = String(question.id);
      if (Object.prototype.hasOwnProperty.call(state.answers, answerKey)) continue;
      const selected = index === state.current ? state.selected : null;
      state.answers[answerKey] = {
        selected,
        correct: selected !== null && selected === question.answer,
        timedOut: true
      };
    }
  }

  state.current = end - 1;
  state.selected = null;
  state.submitted = true;
  state.roundTimedOut = timedOut;
  state.resultStart = start;
  state.resultEnd = end;
  const isFinalRound = end === questions.length;
  state.reviewStart = isFinalRound ? 0 : start;
  state.reviewEnd = isFinalRound ? questions.length : end;
  state.screen = "result";
  saveProgress();
  updateScoreboard();
  showResult();
}

function showResult() {
  if (!state) return;
  const { start, end } = getBatchRange(state.current);
  const roundStart = Number.isInteger(state.resultStart) ? state.resultStart : start;
  const roundEnd = Number.isInteger(state.resultEnd) && state.resultEnd > roundStart ? state.resultEnd : end;
  const roundCounts = getCounts(roundStart, roundEnd);
  const overallCounts = getCounts(0, roundEnd);
  const roundSize = roundEnd - roundStart;
  const roundNumber = Math.floor(roundStart / BATCH_SIZE) + 1;
  const isFinalRound = roundEnd === questions.length;
  const percentage = roundSize ? Math.round((roundCounts.correct / roundSize) * 100) : 0;
  const overallPercentage = roundEnd ? Math.round((overallCounts.correct / roundEnd) * 100) : 0;

  elements.resultEyebrow.textContent = isFinalRound ? "PRACTICE COMPLETE" : `ROUND ${roundNumber} COMPLETE`;
  elements.resultTitle.textContent = isFinalRound ? "Final quiz results" : `Round ${roundNumber} results`;
  elements.resultMessage.textContent = state.roundTimedOut
    ? "Time expired. Unanswered questions in this round were counted as wrong."
    : isFinalRound
      ? overallPercentage >= 80
        ? "Excellent work! You have completed the quiz with a strong score."
        : overallPercentage >= 50
          ? "Nice progress! You have completed the quiz; keep practicing to improve."
          : "Keep practicing. Review your answers and try again."
      : `You completed round ${roundNumber}. Continue when you are ready for the next round.`;
  elements.finalScore.textContent = isFinalRound
    ? `${overallCounts.correct} / ${questions.length}`
    : `${roundCounts.correct} / ${roundSize}`;
  elements.finalPercentage.textContent = isFinalRound
    ? `${overallPercentage}% overall`
    : `${percentage}% correct this round`;
  elements.finalCorrect.textContent = roundCounts.correct;
  elements.finalWrong.textContent = roundCounts.wrong;
  elements.finalAttempted.textContent = roundCounts.attempted;
  elements.overallSummary.textContent = isFinalRound
    ? `Final total: ${overallCounts.correct} correct, ${overallCounts.wrong} wrong out of ${questions.length} questions.`
    : `Overall so far: ${overallCounts.correct} correct, ${overallCounts.wrong} wrong out of ${roundEnd} questions (${overallPercentage}%).`;
  elements.reviewButton.hidden = getCounts(state.reviewStart, state.reviewEnd).wrong === 0;
  elements.nextRoundButton.hidden = isFinalRound;
  elements.nextRoundButton.textContent = `Start round ${roundNumber + 1} (${BATCH_SIZE} questions)`;
  showScreen("result");
}

function startNextRound() {
  if (!state || state.screen !== "result" || state.resultEnd >= questions.length) return;
  state.current = state.resultEnd;
  state.selected = null;
  state.submitted = false;
  state.batchDeadline = Date.now() + ROUND_TIME_MS;
  state.roundTimedOut = false;
  state.screen = "quiz";
  saveProgress();
  showScreen("quiz");
  loadQuestion();
  startTimer();
}

function showWrongAnswerReview() {
  if (!state) return;
  state.reviewReturnScreen = state.screen;
  state.screen = "review";
  saveProgress();
  renderWrongAnswerReview();
  showScreen("review");
}

function renderWrongAnswerReview() {
  const wrongQuestions = state.order
    .slice(state.reviewStart, state.reviewEnd)
    .map((questionIndex) => questions[questionIndex])
    .filter((question) => {
      const answer = state.answers[String(question.id)];
      return answer && !answer.correct;
    });

  elements.reviewList.replaceChildren();
  if (!wrongQuestions.length) {
    const message = document.createElement("p");
    message.className = "empty-review";
    message.textContent = "No wrong answers to review. Perfect score!";
    elements.reviewList.append(message);
  } else {
    wrongQuestions.forEach((question) => {
      const item = document.createElement("article");
      item.className = "review-item";
      const prompt = document.createElement("p");
      prompt.className = "review-question";
      prompt.textContent = question.question;
      const answer = state.answers[String(question.id)];
      const correct = document.createElement("p");
      correct.className = "review-answer";
      correct.textContent = `Correct answer: ${LETTERS[question.answer]}) ${question.options[question.answer]}`;
      item.append(prompt, correct);
      if (answer.selected === null) {
        const unanswered = document.createElement("p");
        unanswered.className = "review-explanation";
        unanswered.textContent = "Your answer: Not answered (time expired).";
        item.append(unanswered);
      }
      if (question.explanation) {
        const explanation = document.createElement("p");
        explanation.className = "review-explanation";
        explanation.textContent = question.explanation;
        item.append(explanation);
      }
      elements.reviewList.append(item);
    });
  }
}

function returnToResults() {
  if (!state) return;
  state.screen = state.reviewReturnScreen || "result";
  state.reviewReturnScreen = null;
  saveProgress();
  showResult();
}

function resetProgress() {
  stopTimer();
  localStorage.removeItem(STORAGE_KEY);
  state = null;
  updateScoreboard();
  elements.startButton.hidden = false;
  elements.continueButton.hidden = true;
  elements.continueButton.textContent = "Continue practice";
  elements.resetButton.disabled = true;
  elements.shuffleCheckbox.disabled = false;
  showScreen("start");
}

function stopTimer() {
  if (timerInterval !== null) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function updateTimer() {
  if (!state || state.screen !== "quiz") {
    stopTimer();
    return;
  }

  const remaining = Math.max(0, state.batchDeadline - Date.now());
  const seconds = Math.ceil(remaining / 1000);
  const minutesText = String(Math.floor(seconds / 60)).padStart(2, "0");
  const secondsText = String(seconds % 60).padStart(2, "0");
  elements.timer.textContent = `${minutesText}:${secondsText}`;
  elements.timer.parentElement.classList.toggle("is-urgent", remaining <= 60 * 1000);

  if (remaining === 0) {
    finishRound(true);
  }
}

function startTimer() {
  stopTimer();
  if (!state || state.screen !== "quiz") return;
  updateTimer();
  if (state.screen === "quiz") timerInterval = setInterval(updateTimer, 1000);
}

function continuePractice() {
  if (!state) return;
  if (state.screen === "quiz") {
    showScreen("quiz");
    loadQuestion();
    startTimer();
  } else if (state.screen === "result") {
    showResult();
  } else if (state.screen === "review") {
    renderWrongAnswerReview();
    showScreen("review");
  }
}

function initialize() {
  elements.questionTotal.textContent = `${questions.length} exam-style questions · ${BATCH_SIZE} per round · 15 minutes per round`;
  elements.startButton.disabled = questions.length === 0;

  const savedState = loadSavedState();
  if (savedState) {
    state = savedState;
    updateScoreboard();
    elements.shuffleCheckbox.checked = savedState.shuffle;
    elements.startButton.hidden = true;
    elements.continueButton.hidden = false;
    elements.continueButton.textContent = savedState.screen === "result"
      ? "View round results"
      : savedState.screen === "review"
        ? "Continue review"
        : "Continue practice";
    elements.resetButton.disabled = false;
    elements.shuffleCheckbox.disabled = true;
  }

  elements.startButton.addEventListener("click", () => startPractice(elements.shuffleCheckbox.checked));
  elements.continueButton.addEventListener("click", continuePractice);
  elements.resetButton.addEventListener("click", resetProgress);
  elements.submitButton.addEventListener("click", submitAnswer);
  elements.nextButton.addEventListener("click", nextQuestion);
  elements.reviewButton.addEventListener("click", showWrongAnswerReview);
  elements.nextRoundButton.addEventListener("click", startNextRound);
  elements.backToResultsButton.addEventListener("click", returnToResults);

  document.addEventListener("keydown", (event) => {
    if (!state || state.screen !== "quiz" || elements.quizScreen.hidden
      || event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.key.toLowerCase();
    const optionIndex = LETTERS.indexOf(key);
    if (optionIndex !== -1 && !state.submitted) {
      event.preventDefault();
      selectOption(optionIndex);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (state.submitted) nextQuestion();
      else submitAnswer();
    }
  });
}

initialize();
