import { renderPassage } from "./shared/render.js";
import {
  validateReader,
  languageName,
  languageDirection,
  levelNames,
} from "./shared/data.js";
import {
  newProgress,
  chooseStage,
  toggleProgress,
  moveProgress,
} from "./shared/progression.js";
const $ = (id) => document.getElementById(id),
  reading = $("reading");
let data,
  state = newProgress();
function install(bundle) {
  data = validateReader(bundle);
  state = newProgress();
  data.languages ||= { base: "en", learning: "fr" };
  if (data.schema_version === 1) state.automatic = false;
  const labels =
    data.schema_version === 2 ? levelNames(data.languages) : data.stages;
  $("levels").replaceChildren();
  labels.forEach((label, i) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.dataset.stage = i;
    b.onclick = () => {
      state = chooseStage(state, i);
      render();
    };
    $("levels").append(b);
  });
  $("gradual").disabled = data.schema_version === 1;
  $("gradual-label").textContent =
    `Gradually add more ${languageName(data.languages.learning)} as you read more.`;
  $("title").textContent = data.title || "Reader";
  $("subtitle").textContent =
    `${languageName(data.languages.base)} · ${languageName(data.languages.learning)}`;
  $("status").classList.remove("error");
  render();
}
function render() {
  const p = { ...data.passages[state.index], languages: data.languages };
  reading.replaceChildren();
  const paragraph = document.createElement("p");
  paragraph.lang =
    state.stage === 5 ? data.languages.learning : data.languages.base;
  paragraph.dir = languageDirection(paragraph.lang);
  reading.append(paragraph);
  renderPassage(paragraph, p, state.stage);
  $("page-status").textContent =
    `Passage ${state.index + 1} of ${data.passages.length}`;
  $("previous").disabled = state.index === 0;
  $("next").disabled = state.index === data.passages.length - 1;
  $("status").textContent =
    `${data.chapter || ""} · ${(data.schema_version === 2 ? levelNames(data.languages) : data.stages)[state.stage]}${state.stage === 5 ? "" : " · Tap an insertion for its original meaning."}`;
  $("levels")
    .querySelectorAll("button")
    .forEach((b) =>
      b.setAttribute(
        "aria-pressed",
        String(Number(b.dataset.stage) === state.stage),
      ),
    );
  $("gradual").checked = state.automatic;
}
for (const [id, delta] of [
  ["previous", -1],
  ["next", 1],
])
  $(id).onclick = () => {
    if (!data) return;
    state = moveProgress(
      state,
      Math.max(0, Math.min(data.passages.length - 1, state.index + delta)),
    );
    render();
    reading.scrollIntoView({ block: "start" });
  };
$("gradual").onchange = () => {
  state = toggleProgress(state, $("gradual").checked);
  render();
};
$("import-reader").onchange = async () => {
  try {
    const f = $("import-reader").files[0];
    if (!f) return;
    if (f.size > 10000000) throw Error("Reading file exceeds 10 MB");
    install(JSON.parse(await f.text()));
    $("import-status").textContent =
      data.schema_version === 1
        ? "Legacy reading file opened with its original three levels. Re-export in the editor for six levels."
        : "Reading file opened. Progress and changes stay in this session.";
  } catch (e) {
    $("import-status").textContent = e.message;
  } finally {
    $("import-reader").value = "";
  }
};
try {
  const response = await fetch("./reader.json");
  if (!response.ok) throw Error();
  install(await response.json());
} catch {
  $("status").classList.add("error");
  $("status").textContent =
    "The reading data could not be loaded. Please reload the page or open a reading file.";
}
