// Núcleo: DOM, API, armazenamento seguro, ícones, markdown seguro e estado global.

// ---------------------------------------------------------------- DOM
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  add(el, kids);
  return el;
}
export function add(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k === null || k === undefined || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
export function mount(el, ...kids) { clear(el); return add(el, kids); }

// ---------------------------------------------------------------- eventos e estado
export const bus = new EventTarget();
export const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));
export const on = (name, fn) => { const f = (e) => fn(e.detail); bus.addEventListener(name, f); return () => bus.removeEventListener(name, f); };

export const S = {
  eu: null,          // /v1/auth/eu
  cat: null,         // /v1/catalogo (público)
  prompts: [],       // /v1/prompts (com acesso por plano)
  tabs: [],
  active: null,
  sidebar: 'catalogo',
  recentes: [],
};

// ---------------------------------------------------------------- armazenamento local (nunca para segredos)
export const store = {
  get(k, def = null) { try { const v = localStorage.getItem('iapm.' + k); return v === null ? def : JSON.parse(v); } catch { return def; } },
  set(k, v) { try { localStorage.setItem('iapm.' + k, JSON.stringify(v)); } catch { /* sem armazenamento */ } },
  del(k) { try { localStorage.removeItem('iapm.' + k); } catch { /* sem armazenamento */ } },
};

// ---------------------------------------------------------------- API
export class ApiError extends Error {
  constructor(status, msg, campos, codigo) { super(msg); this.status = status; this.campos = campos || null; this.codigo = codigo || null; }
}
export async function api(path, { method = 'GET', body, raw = false } = {}) {
  const headers = { 'X-IAPM-Client': 'web' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let resp;
  try {
    resp = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'Sem conexão com o servidor. Verifique a internet e tente novamente.');
  }
  if (raw) return resp;
  let data = null;
  try { data = await resp.json(); } catch { /* sem corpo */ }
  if (!resp.ok) {
    const d = data && data.detail;
    let msg = 'Algo deu errado. Tente novamente.';
    let campos = null; let codigo = null;
    if (typeof d === 'string') msg = d;
    else if (Array.isArray(d)) msg = 'Confira os dados informados.';
    else if (d && typeof d === 'object') { msg = d.mensagem || msg; campos = d.campos || null; codigo = d.codigo || null; }
    if (resp.status === 401 && !path.startsWith('/v1/auth/entrar') && !path.startsWith('/v1/auth/registrar')) emit('auth:expirou');
    throw new ApiError(resp.status, msg, campos, codigo);
  }
  return data;
}

// ---------------------------------------------------------------- ícones (SVG montado por DOM, sem innerHTML)
const NS = 'http://www.w3.org/2000/svg';
const P = (d) => ['path', { d }];
const ICONS = {
  home: [P('M3 11l9-8 9 8'), P('M5 10v10h14V10'), P('M10 20v-6h4v6')],
  compass: [['circle', { cx: 12, cy: 12, r: 9 }], P('M15.5 8.5l-2 5-5 2 2-5z')],
  library: [P('M4 4h4v16H4z'), P('M10 4h4v16h-4z'), P('M16.5 5l3.8 1.2-3.5 13.8-3.8-1.2z')],
  list: [P('M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01')],
  briefcase: [['rect', { x: 3, y: 7, width: 18, height: 13, rx: 2 }], P('M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18')],
  card: [['rect', { x: 2, y: 5, width: 20, height: 14, rx: 2 }], P('M2 10h20')],
  code: [P('M8 8l-5 4 5 4M16 8l5 4-5 4M14 5l-4 14')],
  gear: [P('M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z'), ['circle', { cx: 12, cy: 12, r: 3 }]],
  shield: [P('M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z')],
  help: [['circle', { cx: 12, cy: 12, r: 9 }], P('M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01')],
  x: [P('M6 6l12 12M18 6L6 18')],
  plus: [P('M12 5v14M5 12h14')],
  play: [['polygon', { points: '7,4 20,12 7,20' }]],
  check: [P('M4 12l5 5L20 6')],
  lock: [['rect', { x: 5, y: 11, width: 14, height: 10, rx: 2 }], P('M8 11V7a4 4 0 0 1 8 0v4')],
  copy: [['rect', { x: 9, y: 9, width: 11, height: 11, rx: 2 }], P('M5 15V6a2 2 0 0 1 2-2h9')],
  download: [P('M12 4v11M7 11l5 5 5-5M4 20h16')],
  search: [['circle', { cx: 11, cy: 11, r: 7 }], P('M21 21l-5-5')],
  chev: [P('M9 6l6 6-6 6')],
  chevd: [P('M6 9l6 6 6-6')],
  sun: [['circle', { cx: 12, cy: 12, r: 4 }], P('M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4')],
  moon: [P('M21 13a9 9 0 1 1-10-10 7 7 0 0 0 10 10z')],
  user: [['circle', { cx: 12, cy: 8, r: 4 }], P('M4 21c0-4 4-7 8-7s8 3 8 7')],
  file: [P('M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5')],
  alert: [P('M12 3l10 18H2zM12 10v5M12 18h.01')],
  info: [['circle', { cx: 12, cy: 12, r: 9 }], P('M12 11v6M12 7.5h.01')],
  key: [['circle', { cx: 8, cy: 15, r: 4 }], P('M11 12l9-9M16 7l3 3')],
  bolt: [P('M13 2L4 14h7l-1 8 9-12h-7z')],
  sparkles: [P('M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2zM19 15l1 2 2 1-2 1-1 2-1-2-2-1 2-1z')],
  trash: [P('M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6')],
  refresh: [P('M20 11a8 8 0 1 0-2 6M20 5v6h-6')],
  ext: [P('M14 4h6v6M20 4l-9 9M18 14v6H4V6h6')],
  menu: [P('M4 6h16M4 12h16M4 18h16')],
  panel: [['rect', { x: 3, y: 4, width: 18, height: 16, rx: 2 }], P('M15 4v16')],
  calc: [['rect', { x: 5, y: 3, width: 14, height: 18, rx: 2 }], P('M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01')],
  clip: [P('M9 4h6v3H9zM7 5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1M9 14l2 2 4-4')],
  building: [['rect', { x: 4, y: 3, width: 16, height: 18 }], P('M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h.01M15 15h.01M10 21v-3h4v3')],
  book: [P('M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM19 19v2H6')],
  logout: [P('M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M16 8l4 4-4 4M20 12H9')],
  eye: [P('M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z'), ['circle', { cx: 12, cy: 12, r: 3 }]],
  flag: [P('M5 21V4M5 4h11l-2 4 2 4H5')],
};
export function icon(name, cls = '') {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', ('i ' + cls).trim());
  svg.setAttribute('aria-hidden', 'true');
  for (const [tag, attrs] of ICONS[name] || ICONS.file) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    svg.append(e);
  }
  return svg;
}

// ---------------------------------------------------------------- markdown mínimo e seguro (nós DOM, sem HTML)
function inline(text) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/g;
  let last = 0; let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('**')) out.push(h('strong', null, t.slice(2, -2)));
    else if (t.startsWith('`')) out.push(h('code', null, t.slice(1, -1)));
    else out.push(h('em', null, t.slice(1, -1)));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
export function md(texto) {
  const root = h('div', { class: 'md' });
  let lista = null; let tipo = null;
  const fecha = () => { lista = null; tipo = null; };
  for (const bruta of String(texto ?? '').split('\n')) {
    const ln = bruta.trimEnd();
    let m;
    if ((m = ln.match(/^\s*[-•*]\s+(.*)$/))) {
      if (tipo !== 'ul') { lista = h('ul'); root.append(lista); tipo = 'ul'; }
      lista.append(h('li', null, ...inline(m[1])));
    } else if ((m = ln.match(/^\s*(\d+)[.)]\s+(.*)$/))) {
      if (tipo !== 'ol') { lista = h('ol'); root.append(lista); tipo = 'ol'; }
      lista.append(h('li', null, ...inline(m[2])));
    } else if (ln.trim() === '') { fecha(); }
    else { fecha(); root.append(h('p', null, ...inline(ln))); }
  }
  return root;
}

// ---------------------------------------------------------------- formatação
export const fmtNum = (n, casas = 0) => (n === null || n === undefined || Number.isNaN(n)) ? 'indisponível'
  : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
export function fmtData(iso, comHora = true) {
  if (!iso) return '';
  const d = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z');
  const o = { day: '2-digit', month: '2-digit', year: 'numeric' };
  if (comHora) Object.assign(o, { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleString('pt-BR', o);
}
export function diasAte(iso) {
  if (!iso) return null;
  const d = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z');
  return Math.ceil((d - new Date()) / 86400000);
}
export const rotuloSetor = (id) => (S.cat?.taxonomia.setores.find((s) => s.id === id)?.nome) || id;
export const rotuloSetorCurto = (id) => (S.cat?.taxonomia.setores.find((s) => s.id === id)?.curto) || id;
export const rotuloFase = (id) => (S.cat?.taxonomia.fases.find((f) => f.id === id)?.nome) || id;
export const rotuloDisc = (id) => (S.cat?.taxonomia.disciplinas.find((d) => d.id === id)?.nome) || id;
export const rotuloNivel = (id) => (S.cat?.modelos.find((m) => m.id === id)?.nome) || id;
export const FONTES = { creditos: 'Créditos', byok: 'Chave própria', simulado: 'Demonstração' };
export const DECISOES = { aprovada: 'Aprovada', aprovada_com_ressalvas: 'Aprovada com ressalvas', rejeitada: 'Rejeitada' };

export async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); return true; } catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } }); ta.value = texto; document.body.append(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove(); return ok;
  }
}
export function baixar(conteudo, nome, tipo = 'application/octet-stream') {
  const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: nome }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export const debounce = (fn, ms = 350) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const iniciais = (nome) => (nome || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
