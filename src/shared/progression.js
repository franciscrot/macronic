// Count newly reached reading sections, not repeated Back/Next clicks.
export function newProgress() {
  return {
    index: 0,
    furthest: 0,
    stage: 1,
    anchor: 0,
    anchorStage: 1,
    automatic: true,
  };
}
export function chooseStage(state, stage) {
  return { ...state, stage, anchor: state.furthest, anchorStage: stage };
}
export function toggleProgress(state, automatic) {
  return {
    ...state,
    automatic,
    anchor: state.furthest,
    anchorStage: state.stage,
  };
}
export function moveProgress(state, index) {
  const furthest = Math.max(state.furthest, index);
  let stage = state.stage;
  if (state.automatic && state.anchorStage < 5) {
    stage = state.anchorStage;
    let completed = furthest - state.anchor;
    const intervals = [3, 4, 5, 6];
    while (stage < 4 && completed >= intervals[stage]) {
      completed -= intervals[stage];
      stage++;
    }
  }
  return { ...state, index, furthest, stage };
}
