// Painéis da barra lateral, um por atividade.
import { h, api, S, store, icon, mount, on, rotuloSetor, rotuloFase, rotuloSetorCurto, fmtData, diasAte, fmtNum } from './core.js';
import * as go from './go.js';
import { abaAtiva } from './nav.js';

export const ATIVIDADES = [
  { id: 'inicio', titulo: 'Início', icone: 'home', dica: 'Início' },
  { id: 'assistente', titulo: 'Análise guiada', icone: 'compass', dica: 'Análise guiada (Alt+N)' },
  { id: 'catalogo', titulo: 'Catálogo de prompts', icone: 'library', dica: 'Catálogo (Alt+L)' },
  { id: 'execucoes', titulo: 'Execuções recentes', icone: 'list', dica: 'Execuções (Alt+E)' },
  { id: 'servicos', titulo: 'Serviços PMO', icone: 'briefcase', dica: 'Serviços PMO' },
  { id: 'plano', titulo: 'Plano e uso', icone: 'card', dica: 'Plano e uso (Alt+U)' },
  { id: 'api', titulo: 'API e integrações', icone: 'code', dica: 'API (Alt+I)' },
];

let limpezas = [];
const ouve = (nome, fn) => { limpezas.push(on(nome, fn)); };
const statusDot = (st) => h('span', { class: 'badge-dot ' + ({ concluida: 'ok', erro: 'bad', em_andamento: 'run' }[st] || '') });

export async function primeirosPassos() {
  let execs = [];
  try { execs = (await api('/v1/execucoes?limite=100')).execucoes; } catch { /* sem dados */ }
  const eu = S.eu;
  return [
    { t: 'Criar a sua conta', d: 'Pronto: você já está dentro.', ok: true },
    { t: 'Rodar uma análise de exemplo', d: 'Abra um prompt, carregue o exemplo do livro e execute em modo demonstração.', ok: execs.length > 0, acao: () => go.abrirAssistente(), rot: 'Começar' },
    { t: 'Validar um resultado', d: 'Registre quem revisou e a decisão. É o que torna a análise auditável.', ok: execs.some((e) => e.validacao), acao: () => (execs[0] ? go.abrirExecucao(execs[0].id, execs[0].prompt_titulo) : go.abrirAssistente()), rot: 'Validar' },
    { t: 'Liberar a IA de verdade', d: 'Resgate o código do livro, cadastre a sua chave ou compre créditos.', ok: eu.plano.nivel > 0 || eu.byok.configurado || eu.creditos > 0, acao: () => go.abrirPlano(), rot: 'Ver opções' },
    { t: 'Conectar por API (opcional)', d: 'Gere uma chave e execute os prompts a partir da sua planilha ou sistema.', ok: false, acao: () => go.abrirApi(), rot: 'Abrir API' },
  ];
}

// ---------------------------------------------------------------- catálogo (árvore setor > fase > prompt)
function arvoreCatalogo() {
  const raiz = h('div');
  const busca = h('input', { class: 'inp', type: 'search', placeholder: 'Filtrar prompts...', 'aria-label': 'Filtrar prompts' });
  const arvore = h('div', { class: 'tree sp8' });
  const abertos = new Set(store.get('arvore', ['og', 'mineracao']));
  const desenha = () => {
    const termo = busca.value.trim().toLowerCase();
    const ativoId = abaAtiva()?.tab.dados?.promptId;
    mount(arvore);
    for (const s of S.cat.taxonomia.setores) {
      const doSetor = S.prompts.filter((p) => p.setor === s.id && (!termo || (p.titulo + ' ' + p.resumo).toLowerCase().includes(termo)));
      if (termo && !doSetor.length) continue;
      const grp = h('div', { class: 'grp' + ((abertos.has(s.id) || termo) ? ' open' : '') });
      const total = S.prompts.filter((p) => p.setor === s.id).length;
      const cab = h('div', { class: 'gh', role: 'button', tabindex: '0', onclick: () => { abertos.has(s.id) ? abertos.delete(s.id) : abertos.add(s.id); store.set('arvore', [...abertos]); desenha(); } },
        icon('chev', 'chev'), h('span', { text: s.nome }), h('span', { class: 'cnt', text: total }));
      const sub = h('div', { class: 'sub' });
      if (!doSetor.length) sub.append(h('div', { class: 'leaf empty', onclick: () => go.abrirCatalogo({ setor: s.id }) }, h('span', { class: 't', text: 'Ainda sem prompts. Sugerir...' })));
      for (const f of S.cat.taxonomia.fases) {
        const ps = doSetor.filter((p) => p.fase === f.id);
        for (const p of ps) {
          sub.append(h('div', { class: 'leaf' + (p.id === ativoId ? ' on' : ''), title: p.titulo, role: 'button', tabindex: '0', onclick: () => go.abrirPrompt(p.id) },
            h('span', { class: 'chip', text: f.nome }), h('span', { class: 't', text: p.titulo }), p.acesso ? null : icon('lock')));
        }
      }
      grp.append(cab, sub); arvore.append(grp);
    }
    if (!arvore.children.length) arvore.append(h('div', { class: 'empty', text: 'Nenhum prompt encontrado.' }));
  };
  busca.addEventListener('input', desenha);
  ouve('tab:ativa', desenha); ouve('eu:mudou', desenha);
  const cob = S.cat.cobertura;
  raiz.append(busca,
    h('div', { class: 'faint sp8', text: `${cob.prompts} prompts cobrem ${cob.cobertas} de ${cob.celulas} combinações de setor e fase.` }),
    arvore,
    h('button', { class: 'btn sm sp12', type: 'button', onclick: () => go.abrirCatalogo() }, icon('library'), 'Abrir matriz de cobertura'));
  desenha();
  return raiz;
}

function painelExecucoes() {
  const raiz = h('div'); const lista = h('div', { class: 'stack' });
  const carrega = async () => {
    try {
      const d = await api('/v1/execucoes?limite=20');
      mount(lista);
      if (!d.execucoes.length) lista.append(h('div', { class: 'empty', text: 'Nenhuma execução ainda. Abra um prompt e execute.' }));
      for (const e of d.execucoes) {
        lista.append(h('div', { class: 'leaf', role: 'button', tabindex: '0', onclick: () => go.abrirExecucao(e.id, e.prompt_titulo) },
          statusDot(e.status), h('span', { class: 't', title: e.prompt_titulo, text: e.prompt_titulo }),
          e.validacao ? icon('check') : null, h('span', { class: 'faint', text: fmtData(e.criado_em, false) })));
      }
    } catch { mount(lista, h('div', { class: 'faint', text: 'Não foi possível carregar.' })); }
  };
  raiz.append(lista, h('button', { class: 'btn sm sp12', type: 'button', onclick: () => go.abrirExecucoes() }, icon('list'), 'Ver todas'));
  carrega(); ouve('exec:mudou', carrega);
  return raiz;
}

function painelInicio() {
  const raiz = h('div'); const lista = h('div', { class: 'stack' });
  const carrega = async () => {
    const passos = await primeirosPassos();
    mount(lista);
    const feitos = passos.filter((p) => p.ok).length;
    lista.append(h('div', { class: 'row' }, h('div', { class: 'ring', style: { '--p': Math.round(feitos / passos.length * 100) }, dataset: { t: `${feitos}/${passos.length}` } }),
      h('div', null, h('b', { text: 'Primeiros passos' }), h('div', { class: 'faint', text: 'Siga a lista para dominar o portal.' }))));
    passos.forEach((p, i) => lista.append(h('div', { class: 'g-step' + (p.ok ? ' done' : '') },
      h('span', { class: 'n' }, p.ok ? icon('check') : String(i + 1)), h('div', { class: 'tx' }, h('b', { text: p.t }), h('span', { text: p.d }),
        (!p.ok && p.acao) ? h('div', null, h('button', { class: 'btn sm sp8', type: 'button', onclick: p.acao, text: p.rot })) : null))));
  };
  raiz.append(lista); carrega(); ouve('exec:mudou', carrega); ouve('eu:mudou', carrega);
  return raiz;
}

function painelAssistente() {
  return h('div', { class: 'stack' },
    h('p', { text: 'A análise guiada leva você do seu projeto ao prompt certo em quatro passos.' }),
    ...['Escolha o setor do projeto.', 'Informe a fase em que ele está.', 'Veja as decisões que o catálogo apoia e escolha uma.', 'Preencha o formulário. O portal calcula os números e chama a IA.'].map((t, i) =>
      h('div', { class: 'g-step' }, h('span', { class: 'n', text: String(i + 1) }), h('div', { class: 'tx' }, h('span', { text: t })))),
    h('button', { class: 'btn primary', type: 'button', onclick: () => go.abrirAssistente() }, icon('compass'), 'Começar agora'));
}

function painelServicos() {
  const raiz = h('div', { class: 'stack' });
  api('/v1/servicos').then((d) => d.servicos.forEach((s) => raiz.append(h('div', { class: 'leaf', role: 'button', tabindex: '0', onclick: () => go.abrirServicos(s.id) }, icon('briefcase'), h('span', { class: 't', title: s.titulo, text: s.titulo })))));
  raiz.append(h('div', { class: 'faint', text: 'Além da plataforma, oferecemos serviços de PMO e gestão de projetos.' }));
  return raiz;
}

function painelPlano() {
  const raiz = h('div', { class: 'stack' });
  const desenha = () => {
    const eu = S.eu; const d = diasAte(eu.plano.valido_ate);
    mount(raiz,
      h('div', { class: 'card flat' }, h('div', { class: 'faint', text: 'Plano atual' }), h('div', { class: 'kpi' }, h('span', { class: 'v', text: eu.plano.nome })),
        eu.plano.valido_ate ? h('div', { class: 'faint', text: `Válido por mais ${d} dia(s), até ${fmtData(eu.plano.valido_ate, false)}.` }) : h('div', { class: 'faint', text: 'Sem validade.' })),
      h('div', { class: 'card flat' }, h('div', { class: 'faint', text: 'Créditos de IA' }), h('div', { class: 'kpi' }, h('span', { class: 'v', text: fmtNum(eu.creditos) }))),
      h('div', { class: 'card flat' }, h('div', { class: 'faint', text: 'Chave própria (BYOK)' }), h('b', { text: eu.byok.configurado ? `Configurada (final ${eu.byok.final})` : 'Não configurada' })),
      h('button', { class: 'btn', type: 'button', onclick: () => go.abrirPlano('codigo') }, icon('book'), 'Resgatar código do livro'),
      h('button', { class: 'btn', type: 'button', onclick: () => go.abrirPlano('planos') }, icon('card'), 'Comparar planos'));
  };
  desenha(); ouve('eu:mudou', desenha);
  return raiz;
}

function painelApi() {
  return h('div', { class: 'stack' },
    h('p', { text: 'Execute os mesmos prompts a partir de planilhas, rotinas e sistemas, por API REST.' }),
    h('button', { class: 'btn primary', type: 'button', onclick: () => go.abrirApi() }, icon('code'), 'Abrir guia da API'),
    h('a', { class: 'btn', href: '/docs', target: '_blank', rel: 'noopener' }, icon('ext'), 'Referência interativa (OpenAPI)'));
}

const PAINEIS = { inicio: painelInicio, assistente: painelAssistente, catalogo: arvoreCatalogo, execucoes: painelExecucoes, servicos: painelServicos, plano: painelPlano, api: painelApi };
export function renderSidebar(id, head, body) {
  limpezas.forEach((f) => f()); limpezas = [];
  const at = ATIVIDADES.find((a) => a.id === id);
  mount(head, at ? at.titulo : '');
  mount(body, (PAINEIS[id] || painelInicio)());
}
