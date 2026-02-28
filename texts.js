const candidePairs = [
  {
    en: "In the country of Westphalia, in the castle of Baron Thunder-ten-tronckh, lived a young boy to whom nature had given the gentlest manners.",
    fr: "Dans la Westphalie, dans le château de monsieur le baron de Thunder-ten-tronckh, vivait un jeune garçon à qui la nature avait donné les mœurs les plus douces.",
  },
  {
    en: "His face announced his soul.",
    fr: "Sa physionomie annonçait son âme.",
  },
  {
    en: "He had sound judgment with a very simple mind, and this is, I think, why he was called Candide.",
    fr: "Il avait le jugement assez droit, avec l'esprit le plus simple; c'est, je crois, pour cette raison qu'on le nommait Candide.",
  },
  {
    en: "The old servants of the house suspected that he was the son of the baron's sister and of a worthy gentleman of the neighborhood.",
    fr: "Les anciens domestiques de la maison soupçonnaient qu'il était le fils de la sœur du baron et d'un honnête gentilhomme du voisinage.",
  },
  {
    en: "The young lady Cunégonde, aged seventeen, was fresh, plump, and full of appetite.",
    fr: "Mademoiselle Cunégonde, âgée de dix-sept ans, était fraîche, grasse, appétissante.",
  },
  {
    en: "The baron's wife weighed about three hundred and fifty pounds and thereby commanded great consideration.",
    fr: "La baronne, qui pesait environ trois cent cinquante livres, s'attirait par là une très grande considération.",
  },
  {
    en: "Pangloss taught metaphysico-theologo-cosmolonigology.",
    fr: "Pangloss enseignait la métaphysico-théologo-cosmolonigologie.",
  },
  {
    en: "He proved admirably that there is no effect without a cause and that, in this best of all possible worlds, the baron's castle was the most beautiful of castles.",
    fr: "Il prouvait admirablement qu'il n'y a point d'effet sans cause, et que, dans ce meilleur des mondes possibles, le château du baron était le plus beau des châteaux.",
  },
  {
    en: "Candide listened attentively and believed innocently.",
    fr: "Candide écoutait attentivement et croyait innocemment.",
  },
  {
    en: "He judged that he could not live without seeing Miss Cunégonde and hearing Master Pangloss.",
    fr: "Il jugeait qu'il ne pouvait vivre sans voir mademoiselle Cunégonde et sans entendre maître Pangloss.",
  },
  {
    en: "One day, Cunégonde, while walking near the little wood, saw Dr. Pangloss giving a lesson in experimental physics to her mother's chambermaid.",
    fr: "Un jour, Cunégonde, en se promenant auprès du petit bois, vit le docteur Pangloss donner une leçon de physique expérimentale à la femme de chambre de sa mère.",
  },
  {
    en: "She returned to the castle all agitated, thoughtful, and full of desire to be learned.",
    fr: "Elle rentra au château tout agitée, toute pensive, toute remplie du désir d'être savante.",
  },
  {
    en: "She met Candide behind a screen and dropped her handkerchief.",
    fr: "Elle rencontra Candide derrière un paravent et laissa tomber son mouchoir.",
  },
  {
    en: "Candide picked it up, and she took his hand with innocence.",
    fr: "Candide le ramassa; elle lui prit innocemment la main.",
  },
  {
    en: "Their mouths met, their eyes sparkled, their knees trembled, and their hearts fluttered.",
    fr: "Leurs bouches se rencontrèrent, leurs yeux s'enflammèrent, leurs genoux tremblèrent, leurs cœurs palpitaient.",
  },
  {
    en: "The baron passed by the screen, saw this cause and this effect, and drove Candide from the castle with mighty kicks.",
    fr: "Le baron passa près du paravent, vit cette cause et cet effet, et chassa Candide du château à grands coups de pied.",
  },
];

function repeatPairs(pairs, repeats) {
  const out = [];
  for (let i = 0; i < repeats; i += 1) {
    for (const pair of pairs) out.push(pair);
  }
  return out;
}

export const texts = [
  {
    id: "candide-loop",
    title: "Candide (Chapter 1 excerpt, repeated)",
    description:
      "Voltaire's French original with a classic public-domain English translation lineage; repeated to create a long progressive reading session.",
    source:
      "Source tradition: Project Gutenberg / public-domain editions of Candide (French original and 19th-century English translations).",
    pairs: repeatPairs(candidePairs, 12),
  },
];
