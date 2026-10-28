// Componentes de interface estilo desktop: avisos, janelas, menus, paleta de comandos e tour.
import { h, $, mount, icon, clear } from './core.js';

// ---------------------------------------------------------------- avisos
export function toast(msg, tipo = 'info', ms = 4800) {
  let box = $('#toasts');
  if (!box) { box = h('div', { id: 'toasts', 'aria-live': 'polite' }); document.body.append(box); }
  const ic = { ok: 'check', bad: 'alert', warn: 'alert', info: 'info' }[tipo] || 'info';
  const t = h('div', { class: 'toast ' + tipo, role: 'status' }, icon(ic), h('div', { text: msg }));
  box.append(t);
  setTimeout(() => t.remove(), ms);
  return t;
}

// ---------------------------------------------------------------- janelas
export function modal({ titulo, corpo, botoes = [], wide = false, aoFechar }) {
  const scrim = h('div', { class: 'scrim', role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo });
  const fechar = () => { scrim.remove(); document.removeEventListener('keydown', esc, true); if (aoFechar) aoFechar(); };
  const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); fechar(); } };
  const rodape = botoes.length ? h('div', { class: 'mf' }, botoes.map((b) => h('button', {
    class: 'btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : ''), type: 'button',
    onclick: async () => { const r = b.onclick ? await b.onclick(api) : undefined; if (b.fechar !== false && r !== false) fechar(); },
  }, b.label))) : null;
  const m = h('div', { class: 'modal' + (wide ? ' wide' : '') },
    h('div', { class: 'mh' }, h('span', { style: { flex: 1 }, text: titulo }),
      h('button', { class: 'btn ghost sm', type: 'button', 'aria-label': 'Fechar', onclick: fechar }, icon('x'))),
    h('div', { class: 'mb' }, corpo), rodape);
  scrim.append(m);
  scrim.addEventListener('mousedown', (e) => { if (e.target === scrim) fechar(); });
  document.addEventListener('keydown', esc, true);
  document.body.append(scrim);
  const alvo = m.querySelector('input, textarea, select') || m.querySelector('.btn.primary') || m.querySelector('.btn');
  if (alvo) setTimeout(() => alvo.focus(), 0);
  const api = { fechar, el: m };
  return api;
}
export function confirmar(titulo, texto, rotulo = 'Confirmar', perigo = false) {
  return new Promise((res) => {
    let feito = false;
    const fim = (v) => { if (!feito) { feito = true; res(v); } };
    modal({
      titulo, corpo: h('p', { text: texto }), aoFechar: () => fim(false),
      botoes: [{ label: 'Cancelar', onclick: () => fim(false) }, { label: rotulo, primary: !perigo, danger: perigo, onclick: () => fim(true) }],
    });
  });
}

// ---------------------------------------------------------------- menus
let menuAberto = null;
export function fechaMenu() {
  if (menuAberto) { menuAberto.pop.remove(); menuAberto.top?.classList.remove('open'); menuAberto = null; }
}
export function abreMenu(ancora, itens, { top = null, alinhar = 'left' } = {}) {
  fechaMenu();
  const pop = h('div', { class: 'menu-pop', role: 'menu' });
  const els = [];
  for (const it of itens) {
    if (it.sep) { pop.append(h('div', { class: 'menu-sep' })); continue; }
    const ativo = it.enabled ? it.enabled() : true;
    const marcado = it.checked ? it.checked() : false;
    const el = h('div', { class: 'menu-item', role: 'menuitem', 'aria-disabled': ativo ? 'false' : 'true', tabindex: '-1' },
      h('span', { class: 'chk' }, marcado ? icon('check') : (it.icon ? icon(it.icon) : null)),
      h('span', { text: it.label }), it.k ? h('span', { class: 'k', text: it.k }) : null);
    el.addEventListener('click', () => { fechaMenu(); if (ativo && it.run) it.run(); });
    el.addEventListener('mouseenter', () => { els.forEach((x) => x.classList.remove('sel')); el.classList.add('sel'); });
    pop.append(el); if (ativo) els.push(el);
  }
  document.body.append(pop);
  const r = ancora.getBoundingClientRect();
  const largura = pop.offsetWidth;
  const x = alinhar === 'right' ? Math.max(8, r.right - largura) : Math.min(r.left, window.innerWidth - largura - 8);
  const y = alinhar === 'up' ? Math.max(8, r.top - pop.offsetHeight - 4) : r.bottom + 2;
  pop.style.left = Math.max(8, x) + 'px'; pop.style.top = y + 'px';
  if (top) top.classList.add('open');
  menuAberto = { pop, top, els };
  let idx = -1;
  const tecla = (e) => {
    if (!menuAberto) { document.removeEventListener('keydown', tecla, true); return; }
    if (e.key === 'Escape') { fechaMenu(); e.preventDefault(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); idx = (idx + (e.key === 'ArrowDown' ? 1 : -1) + els.length) % els.length;
      els.forEach((x) => x.classList.remove('sel')); els[idx].classList.add('sel');
    } else if (e.key === 'Enter' && idx >= 0) { e.preventDefault(); els[idx].click(); }
  };
  document.addEventListener('keydown', tecla, true);
  setTimeout(() => document.addEventListener('mousedown', function f(e) {
    if (!pop.contains(e.target) && !(top && top.contains(e.target))) { fechaMenu(); document.removeEventListener('mousedown', f, true); }
  }, true), 0);
}

export function menuBar(container, menus) {
  mount(container);
  const tops = [];
  for (const m of menus) {
    const b = h('button', { class: 'menu-top', type: 'button', 'aria-haspopup': 'menu', text: m.titulo });
    const abre = () => abreMenu(b, m.itens(), { top: b });
    b.addEventListener('click', () => { if (menuAberto && menuAberto.top === b) fechaMenu(); else abre(); });
    b.addEventListener('mouseenter', () => { if (menuAberto && menuAberto.top !== b) abre(); });
    container.append(b); tops.push(b);
  }
}

// ---------------------------------------------------------------- paleta de comandos
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export function paleta(itensFn) {
  const itens = itensFn();
  const entrada = h('input', { type: 'text', placeholder: 'Digite um comando, um prompt, um setor ou uma fase...', 'aria-label': 'Paleta de comandos', autocomplete: 'off' });
  const lista = h('div', { class: 'list', role: 'listbox' });
  const scrim = h('div', { class: 'scrim' }, h('div', { class: 'palette' }, entrada, lista));
  let vis = []; let sel = 0;
  const fechar = () => { scrim.remove(); document.removeEventListener('keydown', tecla, true); };
  const desenha = () => {
    clear(lista);
    if (!vis.length) { lista.append(h('div', { class: 'empty', text: 'Nada encontrado.' })); return; }
    vis.slice(0, 40).forEach((it, i) => {
      const el = h('div', { class: 'pitem' + (i === sel ? ' sel' : ''), role: 'option' },
        it.icon ? icon(it.icon) : null, h('span', { text: it.label }), it.k ? h('span', { class: 'k', text: it.k }) : null,
        h('span', { class: 'cat', text: it.cat || '' }));
      el.addEventListener('click', () => { fechar(); it.run(); });
      el.addEventListener('mousemove', () => { sel = i; [...lista.children].forEach((c, j) => c.classList.toggle('sel', j === i)); });
      lista.append(el);
    });
    lista.children[sel]?.scrollIntoView({ block: 'nearest' });
  };
  const filtra = () => {
    const termos = norm(entrada.value).split(/\s+/).filter(Boolean);
    vis = itens.filter((it) => { const alvo = norm(it.label + ' ' + (it.cat || '') + ' ' + (it.busca || '')); return termos.every((t) => alvo.includes(t)); });
    sel = 0; desenha();
  };
  const tecla = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); fechar(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, Math.min(vis.length, 40) - 1); desenha(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); desenha(); }
    else if (e.key === 'Enter') { e.preventDefault(); const it = vis[sel]; if (it) { fechar(); it.run(); } }
  };
  entrada.addEventListener('input', filtra);
  scrim.addEventListener('mousedown', (e) => { if (e.target === scrim) fechar(); });
  document.addEventListener('keydown', tecla, true);
  document.body.append(scrim); filtra(); entrada.focus();
}

// ---------------------------------------------------------------- tour guiado
export function tour(passos, aoFim) {
  let i = 0; let hl = null; let pop = null;
  const limpa = () => { hl?.remove(); pop?.remove(); };
  const fim = () => { limpa(); document.removeEventListener('keydown', tecla, true); if (aoFim) aoFim(); };
  const tecla = (e) => { if (e.key === 'Escape') fim(); else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); prox(); } else if (e.key === 'ArrowLeft') { e.preventDefault(); ant(); } };
  const prox = () => { if (i >= passos.length - 1) fim(); else { i++; mostra(); } };
  const ant = () => { if (i > 0) { i--; mostra(); } };
  function mostra() {
    limpa();
    const p = passos[i];
    const alvo = p.sel ? $(p.sel) : null;
    hl = h('div', { class: 'tour-hl' });
    pop = h('div', { class: 'tour-pop', role: 'dialog', 'aria-label': 'Tour de boas-vindas' },
      h('div', { class: 'row sb' }, h('b', { text: p.titulo }), h('span', { class: 'faint', text: `${i + 1} de ${passos.length}` })),
      h('p', { class: 'sp8', text: p.texto }),
      h('div', { class: 'row sb sp8' },
        h('button', { class: 'btn ghost sm', type: 'button', onclick: fim, text: 'Pular tour' }),
        h('div', { class: 'row' },
          h('button', { class: 'btn sm', type: 'button', disabled: i === 0, onclick: ant, text: 'Anterior' }),
          h('button', { class: 'btn primary sm', type: 'button', onclick: prox, text: i === passos.length - 1 ? 'Concluir' : 'Próximo' }))));
    document.body.append(hl, pop);
    if (alvo) {
      const r = alvo.getBoundingClientRect();
      Object.assign(hl.style, { left: r.left - 4 + 'px', top: r.top - 4 + 'px', width: r.width + 8 + 'px', height: r.height + 8 + 'px' });
      const pw = 320; const ph = pop.offsetHeight;
      let x = r.right + 14; let y = r.top;
      if (x + pw > window.innerWidth - 8) { x = Math.max(8, r.left); y = r.bottom + 14; }
      if (y + ph > window.innerHeight - 8) y = Math.max(8, window.innerHeight - ph - 8);
      pop.style.left = x + 'px'; pop.style.top = y + 'px';
    } else {
      Object.assign(hl.style, { left: '50%', top: '50%', width: '0', height: '0' });
      pop.style.left = `calc(50% - 160px)`; pop.style.top = '30%';
    }
    pop.querySelector('.btn.primary').focus();
  }
  document.addEventListener('keydown', tecla, true);
  mostra();
}
