// Raccourcis clavier : A (Admin), S (Studio), C (Compta). Aucune donnée collectée, aucune requête.
const cibles = { a: 'admin', s: 'studio', c: 'compta' };
document.addEventListener('keydown', (ev) => {
  if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.shiftKey) return;
  const el = document.querySelector(`[data-cle="${cibles[ev.key.toLowerCase()]}"]`);
  if (el) { ev.preventDefault(); el.click(); }
});
