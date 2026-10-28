import { h, S, mount, icon, rotuloSetorCurto, rotuloFase, rotuloDisc, api, emit, on } from '../core.js';
import * as go from '../go.js';
import { toast, modal } from '../ui.js';

const RISCO = { baixo: ['ok', 'Risco baixo'], medio: ['warn', 'Risco médio'], alto: ['bad', 'Risco alto'] };

export default function catalogo(tab, el) {
  const raiz = h('div', { class: 'wrap stack' }); el.append(raiz);
  const f = { setor: '', fase: '', disciplina: '', q: '' };
  const tx = () => S.cat.taxonomia;
  const cobertura = S.cat.cobertura;
  const secMatriz = h('div', { class: 'card' }); const secFiltros = h('div', { class: 'row wrap' }); const secLista = h('div', { class: 'stack' });

  function pedir(setor, fase) {
    const t = h('textarea', { class: 'inp', rows: 4, placeholder: 'Que decisão ou entrega você gostaria de apoiar nesta combinação?' });
    modal({ titulo: 'Esta combinação ainda não tem prompt', corpo: h('div', { class: 'stack' }, h('p', { text: `${rotuloSetorCurto(setor)} em ${rotuloFase(fase)}. Quer sugerir? Os pedidos orientam o que entra primeiro no catálogo.` }), t),
      botoes: [{ label: 'Agora não' }, { label: 'Sugerir', primary: true, onclick: async () => {
        if (t.value.trim().length < 10) { toast('Descreva em pelo menos 10 caracteres.', 'warn'); return false; }
        try { await api('/v1/sugestoes', { method: 'POST', body: { setor, fase, descricao: t.value } }); toast('Sugestão registrada. Obrigado!', 'ok'); } catch (e) { toast(e.message, 'bad'); return false; }
      } }] });
  }
  function matriz() {
    const fases = tx().fases; const grid = h('div', { class: 'matrix', style: { gridTemplateColumns: `130px repeat(${fases.length}, minmax(60px, 1fr))` } });
    grid.append(h('div'), ...fases.map((x) => h('div', { class: 'mhead', text: x.nome })));
    for (const s of tx().setores) {
      grid.append(h('div', { class: 'mrow', text: s.curto }));
      for (const fa of fases) {
        const n = S.cat.matriz[s.id][fa.id]; const sel = f.setor === s.id && f.fase === fa.id;
        grid.append(h('div', { class: 'mcell' + (n ? ' has' : '') + (sel ? ' sel' : ''), role: 'button', tabindex: '0', title: n ? `${n} prompt(s)` : 'Sem prompt ainda. Clique para sugerir.',
          onclick: () => { if (!n) { pedir(s.id, fa.id); return; } if (sel) { f.setor = f.fase = ''; } else { f.setor = s.id; f.fase = fa.id; } atualiza(); } }, n ? String(n) : '+'));
      }
    }
    mount(secMatriz, h('div', { class: 'row sb' }, h('h3', { text: 'Matriz de cobertura' }), h('span', { class: 'faint', text: 'Clique em uma célula com número para filtrar. Célula com + ainda não tem prompt: clique para sugerir.' })), grid);
  }
  const sel = (rot, chave, opcoes) => h('select', { class: 'inp', 'aria-label': rot, onchange: (e) => { f[chave] = e.target.value; atualiza(); } },
    h('option', { value: '', text: rot }), ...opcoes.map((o) => h('option', { value: o.id, selected: f[chave] === o.id, text: o.nome })));
  function filtros() {
    const busca = h('input', { class: 'inp', type: 'search', placeholder: 'Buscar por título ou decisão...', 'aria-label': 'Buscar', oninput: (e) => { f.q = e.target.value; lista(); } });
    busca.value = f.q;
    mount(secFiltros, h('div', { style: { flex: '1 1 260px' } }, busca), h('div', { style: { width: '200px' } }, sel('Todos os setores', 'setor', tx().setores)), h('div', { style: { width: '150px' } }, sel('Todas as fases', 'fase', tx().fases)), h('div', { style: { width: '200px' } }, sel('Todas as disciplinas', 'disciplina', tx().disciplinas)),
      (f.setor || f.fase || f.disciplina || f.q) ? h('button', { class: 'btn ghost', type: 'button', onclick: () => { Object.assign(f, { setor: '', fase: '', disciplina: '', q: '' }); atualiza(); }, text: 'Limpar filtros' }) : null);
  }
  function lista() {
    const termo = f.q.toLowerCase();
    const itens = S.prompts.filter((p) => (!f.setor || p.setor === f.setor) && (!f.fase || p.fase === f.fase) && (!f.disciplina || p.disciplinas.includes(f.disciplina))
      && (!termo || (p.titulo + ' ' + p.resumo + ' ' + p.decisao_apoiada).toLowerCase().includes(termo)));
    mount(secLista, h('div', { class: 'faint', text: `${itens.length} prompt(s)` }),
      itens.length ? h('div', { class: 'grid auto' }, itens.map((p) => h('div', { class: 'card pcard' + (p.acesso ? '' : ' locked'), role: 'button', tabindex: '0', onclick: () => go.abrirPrompt(p.id), onkeydown: (e) => { if (e.key === 'Enter') go.abrirPrompt(p.id); } },
        h('div', { class: 'row wrap' }, h('span', { class: 'chip acc', text: rotuloSetorCurto(p.setor) }), h('span', { class: 'chip', text: rotuloFase(p.fase) }), p.acesso ? h('span', { class: 'chip ok', text: 'Disponível' }) : h('span', { class: 'chip warn' }, icon('lock'), 'Leitor')),
        h('div', { class: 'ttl', text: p.titulo }), h('div', { class: 'muted', text: p.resumo }),
        h('div', { class: 'row wrap' }, p.disciplinas.map((d) => h('span', { class: 'chip', text: rotuloDisc(d) }))),
        h('div', { class: 'row sb' }, h('span', { class: 'chip ' + RISCO[p.classificacao_risco_uso][0], text: RISCO[p.classificacao_risco_uso][1] }), h('span', { class: 'faint', text: `${p.origem?.referencia || ''} · v${p.versao}` }))))) : h('div', { class: 'empty', text: 'Nenhum prompt com esses filtros. Experimente limpar os filtros ou sugerir um novo prompt.' }));
  }
  function atualiza() { matriz(); filtros(); lista(); emit('guia:atualizar'); }
  mount(raiz, h('div', null, h('h1', { text: 'Catálogo de prompts' }), h('p', { class: 'muted', text: `${cobertura.prompts} prompts cobrem ${cobertura.cobertas} das ${cobertura.celulas} combinações de setor e fase. Cada prompt segue o framework RCTIF (Papel, Contexto, Tarefa, Instruções, Formato).` })), secMatriz, secFiltros, secLista);
  atualiza();
  on('eu:mudou', () => { if (el.isConnected) atualiza(); });
  return { filtrar: (n) => { Object.assign(f, { setor: n.setor || '', fase: n.fase || '' }); atualiza(); } };
}
