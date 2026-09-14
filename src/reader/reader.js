import { renderPassage } from "./shared/render.js";
let data,
  stage = 0;
const reading = document.querySelector("#reading"),
  status = document.querySelector("#status");
function render() {
  reading.replaceChildren();
  let paragraph, id;
  let count = 0;
  for (const p of data.passages) {
    if (id !== p.paragraph_id) {
      paragraph = document.createElement("p");
      reading.append(paragraph);
      id = p.paragraph_id;
    } else paragraph.append(document.createTextNode(" "));
    renderPassage(paragraph, p, stage);
    count += p.replacements.filter((r) => r.stage <= stage).length;
  }
  status.textContent = `${data.stages[stage]} · ${count} French ${count === 1 ? "word" : "words"} · Select a word for its English meaning.`;
  document
    .querySelectorAll("[data-stage]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(Number(b.dataset.stage) === stage)),
    );
}
document.querySelectorAll("[data-stage]").forEach((b) =>
  b.addEventListener("click", () => {
    stage = Number(b.dataset.stage);
    if (data) render();
  }),
);
try {
  const response = await fetch("./reader.json");
  if (!response.ok) throw new Error();
  data = await response.json();
  if (data.schema_version !== 1 || !Array.isArray(data.passages))
    throw new Error();
  render();
} catch {
  status.classList.add("error");
  status.textContent =
    "The reading data could not be loaded. Please reload the page.";
  document.querySelectorAll("[data-stage]").forEach((b) => (b.disabled = true));
}
