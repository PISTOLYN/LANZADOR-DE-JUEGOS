// Reagrupa el panel de configuracion en 2 columnas (izq: teclas, der: juegos).
// No cambia ningun id, asi que app.js sigue funcionando igual.
(function () {
  const dlg = document.querySelector('#settingsModal .dialog.settings');
  if (!dlg || dlg.dataset.temaListo) return;
  const izq = document.createElement('div'); izq.className = 'col-izq';
  const der = document.createElement('div'); der.className = 'col-der';
  const kids = Array.from(dlg.children);
  const cierre = kids.find(e => e.id === 'closeSettings');
  kids.forEach(e => {
    if (e === cierre) return;
    const esTeclas = e.classList.contains('key-settings') || e.classList.contains('startup-option');
    (esTeclas ? izq : der).appendChild(e);
  });
  // el titulo "CONFIGURACION" va a la derecha; "MENU" lo pone el marco
  dlg.append(izq, der);
  dlg.dataset.temaListo = '1';
})();
