// Gerenciador de abas (documentos) do espaço de trabalho.
import { h, S, emit, store, clear, icon, mount } from './core.js';

export const views = {};
export const instancias = new Map(); // id -> { tab, inst, el }
let stripEl = null; let panelsEl = null;

export function registraView(tipo, fabrica) { views[tipo] = fabrica; }

export function iniciaNav(strip, panels) {
  stripEl = strip; panelsEl = panels;
  strip.addEventListener('auxclick', (e) => {
    if (e.button !== 1) return;
    const t = e.target.closest('.tab'); if (t) fecharAba(t.dataset.id);
  });
}

export function abaAtiva() { return instancias.get(S.active) || null; }

export function abrirAba({ tipo, id, titulo, icone = 'file', dados = {} }) {
  id = id || tipo;
  if (!instancias.has(id)) {
    const tab = { id, tipo, titulo, icone, dados };
    const el = h('div', { class: 'panel', role: 'tabpanel', hidden: true });
    panelsEl.append(el);
    const fabrica = views[tipo];
    if (!fabrica) throw new Error('View desconhecida: ' + tipo);
    const inst = fabrica(tab, el) || {};
    instancias.set(id, { tab, inst, el });
    S.tabs.push(tab);
  }
  ativaAba(id);
  return instancias.get(id);
}

export function ativaAba(id) {
  if (!instancias.has(id)) return;
  S.active = id;
  for (const [k, v] of instancias) v.el.hidden = k !== id;
  const a = instancias.get(id);
  if (a.inst.aoAtivar) a.inst.aoAtivar();
  desenhaAbas(); salva(); emit('tab:ativa', a.tab);
}

export function fecharAba(id) {
  const a = instancias.get(id); if (!a) return;
  if (a.inst.aoFechar) a.inst.aoFechar();
  a.el.remove(); instancias.delete(id);
  const i = S.tabs.findIndex((t) => t.id === id);
  if (i >= 0) S.tabs.splice(i, 1);
  if (S.active === id) {
    const prox = S.tabs[Math.min(i, S.tabs.length - 1)];
    S.active = null;
    if (prox) ativaAba(prox.id); else { desenhaAbas(); salva(); emit('tab:ativa', null); }
  } else { desenhaAbas(); salva(); }
}

export function fechaTodas() { [...instancias.keys()].forEach((id) => { const a = instancias.get(id); a.inst.aoFechar?.(); a.el.remove(); instancias.delete(id); }); S.tabs.length = 0; S.active = null; desenhaAbas(); salva(); emit('tab:ativa', null); }
export function trocaAba(delta) { if (!S.tabs.length) return; const i = Math.max(0, S.tabs.findIndex((t) => t.id === S.active)); ativaAba(S.tabs[(i + delta + S.tabs.length) % S.tabs.length].id); }
export function abaN(n) { const t = S.tabs[n - 1]; if (t) ativaAba(t.id); }

export function renomeia(id, titulo) { const a = instancias.get(id); if (a) { a.tab.titulo = titulo; desenhaAbas(); salva(); } }
export function marcaSuja(id, suja) { const a = instancias.get(id); if (a) { a.tab.suja = suja; desenhaAbas(); } }

export function desenhaAbas() {
  if (!stripEl) return;
  clear(stripEl);
  for (const t of S.tabs) {
    const el = h('div', { class: 'tab' + (t.id === S.active ? ' on' : ''), role: 'tab', 'aria-selected': t.id === S.active ? 'true' : 'false', dataset: { id: t.id }, title: t.titulo },
      icon(t.icone), h('span', { class: 't', text: t.titulo }), t.suja ? h('span', { class: 'dot', title: 'Alterações não salvas' }) : null,
      h('button', { class: 'x', type: 'button', 'aria-label': 'Fechar aba ' + t.titulo, onclick: (e) => { e.stopPropagation(); fecharAba(t.id); } }, icon('x')));
    el.addEventListener('mousedown', (e) => { if (e.button === 0) ativaAba(t.id); });
    stripEl.append(el);
  }
  stripEl.querySelector('.tab.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function salva() {
  store.set('abas', { abas: S.tabs.map((t) => ({ id: t.id, tipo: t.tipo, titulo: t.titulo, icone: t.icone, dados: t.dados })), ativa: S.active });
}
export function restaura() {
  const s = store.get('abas');
  if (!s || !s.abas || !s.abas.length) return false;
  let ok = 0;
  for (const t of s.abas.slice(0, 12)) { try { abrirAba(t); ok++; } catch { /* aba antiga inválida */ } }
  if (s.ativa && instancias.has(s.ativa)) ativaAba(s.ativa);
  return ok > 0;
}
