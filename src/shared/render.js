import { segments } from "./data.js";
export function renderPassage(container, passage, stage) {
  for (const part of segments(passage, stage)) {
    if (!part.replacement) {
      container.append(document.createTextNode(part.text));
      continue;
    }
    const wrapper = document.createElement("span");
    wrapper.className = "insertion";
    const button = document.createElement("button");
    button.className = "word";
    button.lang = "fr";
    button.textContent = part.text;
    button.setAttribute("aria-expanded", "false");
    const gloss = document.createElement("span");
    gloss.className = "gloss";
    gloss.id = `gloss-${passage.id}-${part.replacement.id}`;
    gloss.hidden = true;
    gloss.textContent = part.replacement.english;
    gloss.lang = "en";
    gloss.setAttribute("role", "tooltip");
    button.setAttribute("aria-describedby", gloss.id);
    const show = (on) => {
      gloss.hidden = !on;
      button.setAttribute("aria-expanded", String(on));
    };
    button.addEventListener("focus", () => show(true));
    button.addEventListener("blur", () => show(false));
    wrapper.addEventListener("mouseenter", () => show(true));
    wrapper.addEventListener("mouseleave", () => {
      if (document.activeElement !== button) show(false);
    });
    button.addEventListener("click", () => show(true));
    button.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        show(false);
        e.stopPropagation();
      }
    });
    wrapper.append(button, gloss);
    container.append(wrapper);
  }
}
