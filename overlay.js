const selectionEl = document.getElementById('selection');
let startX = 0, startY = 0;
let dragging = false;

window.overlayApi.onLanguageChanged((lang) => {
  window.i18n.applyTranslations(lang);
});

document.addEventListener('mousedown', (e) => {
  dragging = true;
  startX = e.clientX;
  startY = e.clientY;
  selectionEl.style.left = startX + 'px';
  selectionEl.style.top = startY + 'px';
  selectionEl.style.width = '0px';
  selectionEl.style.height = '0px';
  selectionEl.style.display = 'block';
});

document.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const x = Math.min(e.clientX, startX);
  const y = Math.min(e.clientY, startY);
  const w = Math.abs(e.clientX - startX);
  const h = Math.abs(e.clientY - startY);
  selectionEl.style.left = x + 'px';
  selectionEl.style.top = y + 'px';
  selectionEl.style.width = w + 'px';
  selectionEl.style.height = h + 'px';
});

document.addEventListener('mouseup', (e) => {
  if (!dragging) return;
  dragging = false;
  const x = Math.min(e.clientX, startX);
  const y = Math.min(e.clientY, startY);
  const width = Math.abs(e.clientX - startX);
  const height = Math.abs(e.clientY - startY);

  if (width < 10 || height < 10) {
    window.overlayApi.regionCancelled();
    return;
  }
  window.overlayApi.regionSelected({ x, y, width, height });
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.overlayApi.regionCancelled();
  }
});
