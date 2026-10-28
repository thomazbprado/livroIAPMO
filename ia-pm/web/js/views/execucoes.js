import { h, api, S, mount, icon, fmtData, fmtNum, on, emit, FONTES, DECISOES, rotuloSetorCurto, rotuloFase } from '../core.js';
import * as go from '../go.js';

export default function execucoes(tab, el) {
  const raiz = h('div', { class: 'wrap stack' }); el.append(raiz);
  const f = { q: '', status: '' };
  let dados = { total: 0, execucoes: [] };
  const lista = h('div'); let timer;
  async function carrega() {
    try { dados = await api(`/v1/execucoes?limite=100${f.status ? '&status=' + f.status : ''}${f.q ? '&q=' + encodeURIComponent(f.q) : ''}`); } catch (e) { mount(lista, h('div', { class: 'callout bad' }, icon('alert'), e.message)); return; }
    desenhaLista();
  }
  function desenhaLista() {
    if (!dados.execucoes.length) { mount(lista, h('div', { class: 'empty' }, h('h3', { text: 'Nenhuma execução encontrada' }), h('p', { text: 'Quando você executar um prompt, ele aparece aqui, com o status e a validação.' }), h('button', { class: 'btn primary', type: 'button', onclick: () => go.abrirAssistente(), text: 'Começar uma análise guiada' }))); return; }
    const mostraUsuario = S.eu.usuario.papel === 'admin' && S.eu.plano.assentos > 1;
    mount(lista, h('div', { class: 'tscroll' }, h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, h('th', { text: '' }), h('th', { text: 'Análise' }), h('th', { text: 'Projeto' }), h('th', { text: 'Fonte' }), h('th', { text: 'Validação' }), h('th', { class: 'num', text: 'Créditos' }), mostraUsuario ? h('th', { text: 'Quem' }) : null, h('th', { text: 'Quando' }))),
      h('tbody', null, dados.execucoes.map((e) => {
        const p = S.prompts.find((x) => x.id === e.prompt_id);
        return h('tr', { class: 'click', tabindex: '0', onclick: () => go.abrirExecucao(e.id, e.prompt_titulo), onkeydown: (ev) => { if (ev.key === 'Enter') go.abrirExecucao(e.id, e.prompt_titulo); } },
          h('td', null, h('span', { class: 'badge-dot ' + ({ concluida: 'ok', erro: 'bad', em_andamento: 'run' }[e.status] || ''), title: e.status })),
          h('td', null, h('b', { text: e.prompt_titulo }), p ? h('div', { class: 'faint', text: `${rotuloSetorCurto(p.setor)} / ${rotuloFase(p.fase)}` }) : null),
          h('td', { text: e.projeto_ref || '' }), h('td', null, h('span', { class: 'chip', text: FONTES[e.fonte_ia] })),
          h('td', null, e.status !== 'concluida' ? h('span', { class: 'faint', text: e.status === 'erro' ? 'Erro' : 'Em andamento' }) : e.validacao ? h('span', { class: 'chip ' + (e.validacao === 'aprovada' ? 'ok' : e.validacao === 'rejeitada' ? 'bad' : 'warn'), text: DECISOES[e.validacao] }) : h('span', { class: 'chip warn', text: 'Pendente' }), e.divergencias ? h('span', { class: 'chip bad', title: 'Números divergentes', text: `${e.divergencias} diverg.` }) : null),
          h('td', { class: 'num', text: e.fonte_ia === 'creditos' ? fmtNum(e.creditos_cobrados) : '-' }), mostraUsuario ? h('td', { text: e.usuario || '' }) : null, h('td', { text: fmtData(e.criado_em) }));
      })))), h('div', { class: 'faint sp8', text: `${dados.execucoes.length} de ${dados.total} execução(ões)` }));
  }
  const busca = h('input', { class: 'inp', type: 'search', placeholder: 'Buscar por análise, projeto ou finalidade...', 'aria-label': 'Buscar execuções', oninput: (e) => { f.q = e.target.value; clearTimeout(timer); timer = setTimeout(carrega, 300); } });
  const sel = h('select', { class: 'inp', 'aria-label': 'Status', onchange: (e) => { f.status = e.target.value; carrega(); } }, h('option', { value: '', text: 'Todos os status' }), h('option', { value: 'concluida', text: 'Concluídas' }), h('option', { value: 'em_andamento', text: 'Em andamento' }), h('option', { value: 'erro', text: 'Com erro' }));
  raiz.append(h('div', null, h('h1', { text: 'Execuções' }), h('p', { class: 'muted', text: 'Histórico das análises, com o status da validação humana. Execuções sem validação ainda são apenas rascunhos.' })),
    h('div', { class: 'row wrap' }, h('div', { style: { flex: '1 1 280px' } }, busca), h('div', { style: { width: '190px' } }, sel), h('button', { class: 'btn', type: 'button', onclick: carrega }, icon('refresh'), 'Atualizar')), lista);
  carrega(); on('exec:mudou', () => { if (el.isConnected && !el.hidden) carrega(); });
  return { aoAtivar: carrega };
}
