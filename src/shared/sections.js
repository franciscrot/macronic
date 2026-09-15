// Reading sections group alignment units without changing their text or evidence.
export function readingSections(passages, targetWords = 170) {
  const sections = [];
  let section = [],
    words = 0;
  for (const p of passages) {
    section.push(p);
    words += (p.text || p.translation || "")
      .trim()
      .split(/\s+/u)
      .filter(Boolean).length;
    if (words >= targetWords) {
      sections.push(section);
      section = [];
      words = 0;
    }
  }
  if (section.length) {
    if (words < targetWords / 2 && sections.length)
      sections.at(-1).push(...section);
    else sections.push(section);
  }
  return sections;
}
