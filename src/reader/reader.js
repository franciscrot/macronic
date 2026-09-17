import { readingSections } from "./shared/sections.js";
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
  sections,
  state = newProgress();
function install(bundle) {
  data = validateReader(bundle);
  sections = readingSections(data.passages);
  const chapters = sections.flatMap((s, i) =>
    i === 0 || s[0].chapter_id !== sections[i - 1][0].chapter_id
      ? [{ index: i, title: s[0].chapter_title || data.chapter }]
      : [],
  );
  $("chapter-select").replaceChildren();
  chapters.forEach((c) => {
    const o = document.createElement("option");
    o.value = c.index;
    o.textContent = c.title;
    $("chapter-select").append(o);
  });
  $("chapter-control").hidden = chapters.length < 2;
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
  $("title").textContent = data.title || "Untitled";
  document.title = `${data.title || "Reader"} · Macronic`;
  $("subtitle").textContent =
    `${languageName(data.languages.base)} · ${languageName(data.languages.learning)}`;
  $("status").classList.remove("error");
  render();
}
function render() {
  reading.replaceChildren();
  let paragraph, previousParagraph;
  for (const item of sections[state.index]) {
    const p = { ...item, languages: data.languages };
    const key = state.stage === 5 ? p.target_paragraph_id : p.paragraph_id;
    if (!paragraph || !key || key !== previousParagraph) {
      paragraph = document.createElement("p");
      paragraph.lang =
        state.stage === 5 ? data.languages.learning : data.languages.base;
      paragraph.dir = languageDirection(paragraph.lang);
      reading.append(paragraph);
    } else paragraph.append(document.createTextNode(" "));
    renderPassage(paragraph, p, state.stage);
    previousParagraph = key;
  }
  const currentChapter = sections[state.index][0].chapter_id;
  const first = sections.findIndex((s) => s[0].chapter_id === currentChapter);
  const total = sections.filter(
    (s) => s[0].chapter_id === currentChapter,
  ).length;
  $("chapter-select").value = String(first);
  $("page-status").textContent =
    `Section ${state.index - first + 1} of ${total}`;
  $("previous").disabled = state.index === 0;
  $("next").disabled = state.index === sections.length - 1;
  $("status").textContent =
    `${sections[state.index][0].chapter_title || data.chapter || ""} · ${(data.schema_version === 2 ? levelNames(data.languages) : data.stages)[state.stage]}${state.stage === 5 ? "" : " · Tap an insertion for its original meaning."}`;
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
      Math.max(0, Math.min(sections.length - 1, state.index + delta)),
    );
    render();
    reading.scrollIntoView({ block: "start" });
  };
$("chapter-select").onchange = () => {
  const index = Number($("chapter-select").value);
  state = { ...state, index, furthest: Math.max(state.furthest, index) };
  state = chooseStage(state, state.stage);
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
