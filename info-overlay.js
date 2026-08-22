const startLineEl = document.getElementById('start-line');
const durationLineEl = document.getElementById('duration-line');

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

window.infoOverlayApi.onState((state) => {
  if (state.startText) startLineEl.textContent = state.startText;
  durationLineEl.textContent = formatDuration(state.elapsedSeconds);
});
