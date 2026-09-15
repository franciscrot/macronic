import { renderPassage } from "./shared/render.js";
import { validateReader } from "./shared/data.js";
let data,
  stage = 0,
  page = 0;
const pageSize = 4;
const $ = (id) => document.getElementById(id),
  reading = $("reading"),
  status = $("status");
function render() {
  reading.replaceChildren();
  let paragraph,
    id,
    count = 0;
  for (const p of data.passages.slice(page * pageSize, (page + 1) * pageSize)) {
    if (id !== p.paragraph_id) {
      paragraph = document.createElement("p");
      reading.append(paragraph);
      id = p.paragraph_id;
    } else paragraph.append(document.createTextNode(" "));
    renderPassage(paragraph, p, stage);
    count += p.replacements.filter((r) => r.stage <= stage).length;
  }
  const pages = Math.ceil(data.passages.length / pageSize);
  $("page-status").textContent =
    `${data.chapter || "Reading"} · Page ${page + 1} of ${pages}`;
  $("previous").disabled = page === 0;
  $("next").disabled = page === pages - 1;
  status.textContent = `${data.stages[stage]} · ${count} French words on this page · Tap a word for its English meaning.`;
  document
    .querySelectorAll("[data-stage]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(Number(b.dataset.stage) === stage)),
    );
}
for (const [id, delta] of [
  ["previous", -1],
  ["next", 1],
])
  $(id).onclick = () => {
    if (!data) return;
    page = Math.max(
      0,
      Math.min(Math.ceil(data.passages.length / pageSize) - 1, page + delta),
    );
    render();
    reading.scrollIntoView({ block: "start" });
  };
document.querySelectorAll("[data-stage]").forEach(
  (b) =>
    (b.onclick = () => {
      stage = Number(b.dataset.stage);
      if (data) render();
    }),
);
$("import-reader").onchange = async () => {
  try {
    const f = $("import-reader").files[0];
    if (!f) return;
    if (f.size > 10000000) throw Error("Reading file exceeds 10 MB");
    const next = validateReader(JSON.parse(await f.text()));
    data = next;
    page = 0;
    stage = 0;
    status.classList.remove("error");
    render();
    $("import-status").textContent =
      "Reading file opened. It stays in this browser session.";
  } catch (e) {
    $("import-status").textContent = e.message;
  } finally {
    $("import-reader").value = "";
  }
};
try {
  const response = await fetch("./reader.json");
  if (!response.ok) throw Error();
  data = validateReader(await response.json());
  render();
} catch {
  status.classList.add("error");
  status.textContent =
    "The reading data could not be loaded. Please reload the page or open a reading file.";
}
