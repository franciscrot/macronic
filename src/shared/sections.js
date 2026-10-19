// Reader sections group alignment units but never cross chapter boundaries.
export function readingSections(passages, targetWords = 170) {
  const groups = [];
  for (const p of passages) {
    if (!groups.length || groups.at(-1)[0].chapter_id !== p.chapter_id)
      groups.push([]);
    groups.at(-1).push(p);
  }
  return groups.flatMap((group) => {
    const sections = [];
    let section = [],
      words = 0;
    for (const p of group) {
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
  });
}
