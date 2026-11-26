// Same origin when FastAPI serves this page. If you host the UI separately,
// set this to your API URL, e.g. "https://your-api.onrender.com"
const API_URL = "";

const form = document.getElementById("form");
const verdict = document.getElementById("verdict");
const submitBtn = document.getElementById("submitBtn");
const formError = document.getElementById("formError");
const arcFill = document.getElementById("arcFill");
const cutoff = document.getElementById("cutoff");
const pctNum = document.getElementById("pctNum");
const pctSub = document.getElementById("pctSub");
const badge = document.getElementById("badge");
const explain = document.getElementById("explain");
const el = (id) => document.getElementById(id);

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const NUMERIC_INT = ["person_age", "cb_person_cred_hist_length"];
const NUMERIC_FLOAT = ["person_income", "person_emp_length", "loan_amnt", "loan_int_rate"];

/* ---- loan % of income is derived, not typed ---- */
function updateRatio() {
  const income = parseFloat(form.person_income.value);
  const amount = parseFloat(form.loan_amnt.value);
  form.loan_percent_income.value =
    income > 0 && amount >= 0 ? (amount / income).toFixed(2) : "";
}
form.addEventListener("input", (e) => {
  if (["person_income", "loan_amnt"].includes(e.target.name)) updateRatio();
  e.target.closest(".field")?.classList.remove("invalid");
  formError.hidden = true;
});

/* ---- helpers ---- */
function setState(state) { verdict.dataset.state = state; }

function countUp(target, ms = 1300) {
  if (reduceMotion) { pctNum.textContent = target.toFixed(1); return; }
  const start = performance.now();
  (function tick(now) {
    const t = Math.min((now - start) / ms, 1);
    const eased = 1 - Math.pow(1 - t, 4);
    pctNum.textContent = (target * eased).toFixed(1);
    if (t < 1) requestAnimationFrame(tick);
  })(start);
}

function showResult(r) {
  const prob = r.default_probability;
  const thr = r.threshold;
  const high = r.default_prediction === 1;

  setState(high ? "high" : "low");
  verdict.classList.remove("pop");
  void verdict.offsetWidth;
  verdict.classList.add("pop");

  arcFill.style.strokeDasharray = `${Math.max(prob * 100, 0.8)} 100`;
  cutoff.setAttribute("transform", `rotate(${-90 + 180 * thr} 110 110)`);
  countUp(prob * 100);
  pctSub.textContent = "chance of default";

  badge.textContent = high ? "High risk" : "Low risk";
  explain.textContent = high
    ? "The estimated chance of default is above the cut-off, so the model flags this application."
    : "The estimated chance of default is below the cut-off, so the model passes this application.";

  const gap = (prob - thr) * 100;
  el("factProb").textContent = (prob * 100).toFixed(1) + "%";
  el("factThr").textContent = (thr * 100).toFixed(1) + "%";
  el("factGap").textContent = (gap > 0 ? "+" : "") + gap.toFixed(1) + " pts";
}

function resetVerdict() {
  setState("idle");
  arcFill.style.strokeDasharray = "0 100";
  pctNum.textContent = "--";
  badge.textContent = "Waiting for an application";
  explain.textContent = "Fill in the form and the result appears here.";
  ["factProb", "factThr", "factGap"].forEach((id) => (el(id).textContent = "--"));
}

function validate() {
  let ok = true;
  form.querySelectorAll(".field").forEach((f) => f.classList.remove("invalid"));
  form.querySelectorAll("input[name]:not([readonly]), select").forEach((input) => {
    if (input.type === "radio") return;
    if (!input.checkValidity()) {
      input.closest(".field").classList.add("invalid");
      ok = false;
    }
  });
  ["loan_grade", "cb_person_default_on_file"].forEach((name) => {
    if (!form.querySelector(`input[name=${name}]:checked`)) {
      form.querySelector(`input[name=${name}]`).closest(".field").classList.add("invalid");
      ok = false;
    }
  });
  if (!ok) {
    formError.textContent = "Some fields are empty or out of range. Check the ones outlined in red.";
    formError.hidden = false;
  }
  return ok;
}

function buildPayload() {
  const fd = new FormData(form);
  const p = {};
  NUMERIC_INT.forEach((k) => (p[k] = parseInt(fd.get(k), 10)));
  NUMERIC_FLOAT.forEach((k) => (p[k] = parseFloat(fd.get(k))));
  p.loan_percent_income = parseFloat(form.loan_percent_income.value);
  ["person_home_ownership", "loan_intent", "loan_grade", "cb_person_default_on_file"]
    .forEach((k) => (p[k] = fd.get(k)));
  return p;
}

/* ---- submit ---- */
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validate()) return;

  submitBtn.classList.add("loading");
  setState("loading");
  badge.textContent = "Scoring";
  explain.textContent = "Running the model.";

  try {
    const res = await fetch(`${API_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload()),
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      const msg = Array.isArray(detail.detail)
        ? detail.detail.map((d) => `${d.loc?.slice(-1)[0]}: ${d.msg}`).join(", ")
        : `The server returned ${res.status}.`;
      throw new Error(msg);
    }
    showResult(await res.json());
  } catch (err) {
    resetVerdict();
    formError.textContent = `Could not get a prediction. ${err.message} If the app was idle on Render, wait about a minute for it to wake up and try again.`;
    formError.hidden = false;
  } finally {
    submitBtn.classList.remove("loading");
  }
});

/* ---- extras ---- */
document.getElementById("sampleBtn").addEventListener("click", () => {
  const sample = {
    person_age: 27, person_income: 48000, person_home_ownership: "RENT",
    person_emp_length: 3, loan_intent: "PERSONAL", loan_amnt: 15000,
    loan_int_rate: 13.5, cb_person_cred_hist_length: 4,
  };
  Object.entries(sample).forEach(([k, v]) => (form[k].value = v));
  form.querySelector("input[name=loan_grade][value=C]").checked = true;
  form.querySelector("input[name=cb_person_default_on_file][value=N]").checked = true;
  updateRatio();
  formError.hidden = true;
  form.querySelectorAll(".invalid").forEach((f) => f.classList.remove("invalid"));
});

form.addEventListener("reset", () => {
  setTimeout(() => {
    updateRatio();
    resetVerdict();
    formError.hidden = true;
    form.querySelectorAll(".invalid").forEach((f) => f.classList.remove("invalid"));
  });
});
