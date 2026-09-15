// Count newly reached passages, not repeated Back/Next clicks.
export function newProgress() {
  return {
    index: 0,
    furthest: 0,
    stage: 0,
    anchor: 0,
    anchorStage: 0,
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
  const stage =
    state.automatic && state.anchorStage < 5
      ? Math.min(
          4,
          state.anchorStage + Math.floor((furthest - state.anchor) / 3),
        )
      : state.stage;
  return { ...state, index, furthest, stage };
}
