import { h, api, S, mount, icon, fmtData, diasAte, fmtNum, rotuloSetorCurto, rotuloFase, emit, on, FONTES } from '../core.js';
import * as go from '../go.js';
import { primeirosPassos } from '../sidebar.js';

export default function inicio(tab, el) {
  const raiz = h('div', { class: 'wrap stack' });
  el.append(raiz);
  const eu = () => S.eu;

  async function desenha() {
    const e = eu();
    const primeiro = e.usuario.nome.split(' ')[0];
    let execs = [];
    try { execs = (await api('/v1/execucoes?limite=6')).execucoes; } catch { /* sem dados */ }
    const passos = await primeirosPassos();
    const feitos = passos.filter((p) => p.ok).length;
    const d = diasAte(e.plano.valido_ate);
    const evm = S.prompts.find((p) => p.id === 'renovavel.execucao.evm-recuperacao');

    mount(raiz,
      h('div', { class: 'hero' },
        h('h1', { text: `Olá, ${primeiro}` }),
        h('p', { class: 'sp8', text: 'Aqui você transforma os prompts do livro em análises prontas: escolha o setor e a fase, preencha os dados e deixe o portal calcular, consultar a IA e registrar a validação.' }),
        h('div', { class: 'row wrap sp16' },
          h('button', { class: 'btn primary lg', type: 'button', onclick: () => go.abrirAssistente() }, icon('compass'), 'Começar uma análise guiada'),
          h('button', { class: 'btn lg', type: 'button', onclick: () => go.abrirCatalogo() }, icon('library'), 'Explorar o catálogo'))),
      h('div', { class: 'grid g3' },
        h('div', { class: 'card hero-card', role: 'button', tabindex: '0', onclick: () => go.abrirAssistente() }, h('div', { class: 'ic' }, icon('compass', 'lg')), h('div', null, h('h3', { text: 'Análise guiada' }), h('div', { class: 'muted', text: 'Quatro passos do seu projeto até o prompt certo, sem precisar conhecer o catálogo.' }))),
        h('div', { class: 'card hero-card', role: 'button', tabindex: '0', onclick: () => evm && go.abrirPrompt(evm.id, { exemplo: true, fonte: 'simulado' }) }, h('div', { class: 'ic' }, icon('play', 'lg')), h('div', null, h('h3', { text: 'Ver funcionando em 1 minuto' }), h('div', { class: 'muted', text: 'Abre o caso de EVM do livro já preenchido, em modo demonstração, sem custo.' }))),
        e.plano.nivel === 0
          ? h('div', { class: 'card hero-card', role: 'button', tabindex: '0', onclick: () => go.abrirPlano('codigo') }, h('div', { class: 'ic' }, icon('book', 'lg')), h('div', null, h('h3', { text: 'Comprou o livro?' }), h('div', { class: 'muted', text: 'Resgate o código impresso e libere todos os prompts do nível Leitor.' })))
          : h('div', { class: 'card hero-card', role: 'button', tabindex: '0', onclick: () => go.abrirApi() }, h('div', { class: 'ic' }, icon('code', 'lg')), h('div', null, h('h3', { text: 'Use por API' }), h('div', { class: 'muted', text: 'Gere uma chave e execute os prompts a partir de planilhas e sistemas.' })))),
      h('div', { class: 'grid g2' },
        h('div', { class: 'card' },
          h('div', { class: 'row sb' }, h('h3', { text: 'Primeiros passos' }), h('div', { class: 'ring', style: { '--p': Math.round(feitos / passos.length * 100) }, dataset: { t: `${feitos}/${passos.length}` } })),
          ...passos.map((p) => h('div', { class: 'g-step' + (p.ok ? ' done' : '') }, h('span', { class: 'n' }, p.ok ? icon('check') : '•'), h('div', { class: 'tx' }, h('b', { text: p.t }), h('span', { text: p.d }),
            (!p.ok && p.acao) ? h('div', null, h('button', { class: 'btn sm sp8', type: 'button', onclick: p.acao, text: p.rot })) : null)))),
        h('div', { class: 'stack' },
          h('div', { class: 'card' }, h('h3', { text: 'Sua conta' }),
            h('div', { class: 'grid g3' },
              h('div', { class: 'kpi' }, h('span', { class: 'v', text: e.plano.nome }), h('span', { class: 'l', text: e.plano.valido_ate ? `${d} dia(s) restantes` : 'sem validade' })),
              h('div', { class: 'kpi' }, h('span', { class: 'v', text: fmtNum(e.creditos) }), h('span', { class: 'l', text: 'créditos de IA' })),
              h('div', { class: 'kpi' }, h('span', { class: 'v', text: e.byok.configurado ? 'Sim' : 'Não' }), h('span', { class: 'l', text: 'chave própria' }))),
            h('div', { class: 'row sp12' }, h('button', { class: 'btn sm', type: 'button', onclick: () => go.abrirPlano(), text: 'Plano e uso' }), h('button', { class: 'btn sm', type: 'button', onclick: () => go.abrirPlano('byok'), text: 'Chave própria' }))),
          h('div', { class: 'card' }, h('div', { class: 'row sb' }, h('h3', { text: 'Execuções recentes' }), h('button', { class: 'btn sm ghost', type: 'button', onclick: () => go.abrirExecucoes(), text: 'Ver todas' })),
            execs.length ? h('div', { class: 'stack sp8' }, execs.map((x) => h('div', { class: 'leaf', role: 'button', tabindex: '0', onclick: () => go.abrirExecucao(x.id, x.prompt_titulo) },
              h('span', { class: 'badge-dot ' + ({ concluida: 'ok', erro: 'bad', em_andamento: 'run' }[x.status] || '') }), h('span', { class: 't', text: x.prompt_titulo }), h('span', { class: 'chip', text: FONTES[x.fonte_ia] }), h('span', { class: 'faint', text: fmtData(x.criado_em, false) }))))
              : h('div', { class: 'empty', text: 'Nada por aqui ainda. Comece pela análise guiada.' })))),
      h('div', { class: 'card flat' }, h('div', { class: 'row' }, icon('info'), h('div', { class: 'muted', text: 'Toda saída da IA é um rascunho analítico. Os números são calculados por código e conferidos contra o que o modelo reportou, mas a decisão e a responsabilidade continuam com você. Registre a validação humana de cada resultado.' }))));
  }
  desenha();
  on('eu:mudou', () => { if (el.isConnected && !el.hidden) desenha(); });
  return { aoAtivar: desenha };
}
