import { h, api, S, mount, icon, emit, on, fmtData, fmtNum, diasAte, baixar } from '../core.js';
import { toast, modal, confirmar } from '../ui.js';
import * as go from '../go.js';

export default function plano(tab, el) {
  const raiz = h('div', { class: 'wrap stack' }); el.append(raiz);
  let planos = null; let uso = null; let extrato = null;
  const eu = () => S.eu;
  const admin = () => eu().usuario.papel === 'admin';
  const sec = (id, titulo, sub, ...corpo) => h('section', { class: 'card', id: `plano-sec-${id}` }, h('h2', { text: titulo }), sub ? h('p', { class: 'muted sp8', text: sub }) : null, h('div', { class: 'sp12' }, corpo));
  const rec = async () => { emit('eu:recarregar'); await new Promise((r) => setTimeout(r, 250)); await carrega(); };

  function secPlano() {
    const e = eu(); const d = diasAte(e.plano.valido_ate);
    const origem = { livro: 'Acesso do livro', assinatura: 'Assinatura', gratuito: 'Gratuito', admin: 'Concedido pela equipe' }[e.plano.origem] || e.plano.origem;
    return sec('plano', 'Seu plano', null, h('div', { class: 'grid g3' },
      h('div', { class: 'kpi' }, h('span', { class: 'v', text: e.plano.nome }), h('span', { class: 'l', text: origem })),
      h('div', { class: 'kpi' }, h('span', { class: 'v', text: e.plano.valido_ate ? `${d} dia(s)` : 'Sem validade' }), h('span', { class: 'l', text: e.plano.valido_ate ? `até ${fmtData(e.plano.valido_ate, false)}` : 'plano gratuito' })),
      h('div', { class: 'kpi' }, h('span', { class: 'v', text: fmtNum(e.creditos) }), h('span', { class: 'l', text: 'créditos de IA' }))),
      e.plano.origem === 'livro' && d !== null && d <= 30 ? h('div', { class: 'callout warn sp12' }, icon('alert'), h('div', { text: `O seu acesso do livro termina em ${d} dia(s). Depois disso, a conta volta ao plano Explorar. Considere assinar para manter o nível Leitor.` })) : null);
  }
  function secCodigo() {
    const inp = h('input', { class: 'inp mono', id: 'cod', type: 'text', placeholder: 'IAPM-XXXX-XXXX-XXXX', autocomplete: 'off', style: { textTransform: 'uppercase', maxWidth: '300px' } });
    const resgata = async () => {
      try { const r = await api('/v1/assinatura/resgatar', { method: 'POST', body: { codigo: inp.value } }); toast(`Código aceito: nível ${r.plano} liberado por ${r.dias} dias.`, 'ok', 7000); inp.value = ''; await recarregaTudo(); }
      catch (err) { toast(err.message, 'bad'); }
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') resgata(); });
    return sec('codigo', 'Resgatar código do livro', 'Quem compra o livro "Inteligência Artificial na Gestão de Projetos de Capital" recebe o nível Leitor por um período. Digite o código impresso no livro.',
      admin() ? h('div', { class: 'row wrap' }, inp, h('button', { class: 'btn primary', type: 'button', onclick: resgata }, icon('book'), 'Resgatar')) : h('div', { class: 'callout info' }, icon('info'), 'Peça a um administrador da organização para resgatar o código.'));
  }
  function secCreditos() {
    const demo = planos?.cobranca === 'demo'; const pacs = planos?.pacotes_creditos || [];
    const compra = async (p) => {
      if (!(await confirmar('Comprar créditos (demonstração)', `Adicionar ${fmtNum(p.creditos)} créditos à organização. Nenhuma cobrança real será feita neste ambiente.`, 'Adicionar créditos'))) return;
      try { await api('/v1/creditos/comprar', { method: 'POST', body: { pacote_id: p.id } }); toast('Créditos adicionados.', 'ok'); await recarregaTudo(); } catch (err) { toast(err.message, 'bad'); }
    };
    return sec('creditos', 'Créditos de IA', 'Créditos pagam as execuções feitas com a IA da plataforma. Um crédito cobre o custo do modelo com margem de operação. Execuções com chave própria ou em demonstração não consomem créditos.',
      !demo ? h('div', { class: 'callout info' }, icon('info'), 'A compra online de créditos ainda não está habilitada neste ambiente. Fale com a equipe comercial.') : h('div', { class: 'callout warn' }, icon('info'), 'Ambiente de demonstração: a compra adiciona créditos sem cobrança real.'),
      h('div', { class: 'grid g3 sp12' }, pacs.map((p) => h('div', { class: 'card flat' }, h('div', { class: 'kpi' }, h('span', { class: 'v', text: fmtNum(p.creditos) }), h('span', { class: 'l', text: 'créditos' })), h('div', { class: 'sp8', text: `R$ ${fmtNum(p.preco_brl, 2)} (ilustrativo)` }),
        h('button', { class: 'btn sp8', type: 'button', disabled: !demo || !admin(), onclick: () => compra(p), text: 'Comprar' })))),
      h('h3', { class: 'sp16', text: 'Extrato' }),
      extrato && extrato.lancamentos.length ? h('div', { class: 'tscroll sp8' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', { text: 'Data' }), h('th', { text: 'Descrição' }), h('th', { class: 'num', text: 'Créditos' }), h('th', { class: 'num', text: 'Saldo' }))),
        h('tbody', null, extrato.lancamentos.slice(0, 30).map((l) => h('tr', null, h('td', { text: fmtData(l.criado_em) }), h('td', { text: l.descricao || l.motivo }), h('td', { class: 'num', style: { color: l.delta < 0 ? 'var(--bad)' : 'var(--ok)' }, text: (l.delta > 0 ? '+' : '') + fmtNum(l.delta) }), h('td', { class: 'num', text: fmtNum(l.saldo_apos) })))))) : h('div', { class: 'faint', text: 'Sem lançamentos ainda.' }));
  }
  function secByok() {
    const e = eu(); const inp = h('input', { class: 'inp mono', id: 'byok', type: 'password', placeholder: 'sk-ant-...', autocomplete: 'off', style: { maxWidth: '420px' } });
    const salva = async () => { try { await api('/v1/conta/byok', { method: 'PUT', body: { chave: inp.value } }); inp.value = ''; toast('Chave salva com segurança.', 'ok'); await recarregaTudo(); } catch (err) { toast(err.message, 'bad'); } };
    const testa = async () => { try { const r = await api('/v1/conta/byok/testar', { method: 'POST' }); toast(r.mensagem, r.ok ? 'ok' : 'bad'); } catch (err) { toast(err.message, 'bad'); } };
    const remove = async () => { if (!(await confirmar('Remover chave', 'As próximas execuções não poderão usar chave própria até você cadastrar outra.', 'Remover', true))) return; try { await api('/v1/conta/byok', { method: 'DELETE' }); toast('Chave removida.', 'ok'); await recarregaTudo(); } catch (err) { toast(err.message, 'bad'); } };
    return sec('byok', 'Chave própria de IA (BYOK)', 'Use a sua conta no provedor de IA: o custo vai direto para você e o portal não cobra créditos. A chave é guardada cifrada, nunca é exibida de volta e pode ser removida a qualquer momento.',
      e.byok.configurado ? h('div', { class: 'callout ok' }, icon('check'), h('div', { class: 'row sb', style: { width: '100%' } }, h('span', { text: `Chave configurada (final ${e.byok.final}).` }), admin() ? h('div', { class: 'row' }, h('button', { class: 'btn sm', type: 'button', onclick: testa, text: 'Testar' }), h('button', { class: 'btn sm danger', type: 'button', onclick: remove, text: 'Remover' })) : null)) : null,
      admin() ? h('div', { class: 'row wrap sp12' }, inp, h('button', { class: 'btn primary', type: 'button', onclick: salva }, icon('key'), e.byok.configurado ? 'Substituir chave' : 'Salvar chave')) : h('div', { class: 'callout info sp12' }, icon('info'), 'Somente administradores da organização podem cadastrar a chave.'),
      h('p', { class: 'faint sp8', text: 'Dica: crie uma chave dedicada ao IA PM na sua conta do provedor e defina um limite de gasto nela.' }));
  }
  function secUso() {
    if (!uso) return sec('uso', 'Uso nos últimos 30 dias', null, h('div', { class: 'faint', text: 'Carregando...' }));
    const dias = []; const mapa = Object.fromEntries(uso.por_dia.map((d) => [d.dia, d]));
    for (let i = 29; i >= 0; i--) { const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10); dias.push({ dia: d, execucoes: mapa[d]?.execucoes || 0 }); }
    const max = Math.max(1, ...dias.map((d) => d.execucoes)); const t = uso.total;
    return sec('uso', 'Uso nos últimos 30 dias', null,
      h('div', { class: 'grid g4' }, [['Execuções', fmtNum(t.execucoes)], ['Concluídas', fmtNum(t.concluidas)], ['Créditos usados', fmtNum(t.creditos)], ['Custo no provedor (US$)', fmtNum(t.custo_usd, 4)]].map(([l, v]) => h('div', { class: 'kpi' }, h('span', { class: 'v', text: v }), h('span', { class: 'l', text: l })))),
      h('div', { class: 'bars sp16', role: 'img', 'aria-label': 'Execuções por dia nos últimos 30 dias' }, dias.map((d) => h('div', { class: 'b', style: { height: Math.max(2, d.execucoes / max * 100) + '%' }, title: `${d.dia}: ${d.execucoes}` }))),
      uso.por_prompt.length ? h('div', { class: 'tscroll sp12' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', { text: 'Prompt' }), h('th', { class: 'num', text: 'Execuções' }), h('th', { class: 'num', text: 'Créditos' }))), h('tbody', null, uso.por_prompt.slice(0, 8).map((p) => h('tr', null, h('td', { text: p.titulo }), h('td', { class: 'num', text: fmtNum(p.execucoes) }), h('td', { class: 'num', text: fmtNum(p.creditos) })))))) : null);
  }
  function secPlanos() {
    if (!planos) return sec('planos', 'Planos', null, h('div', { class: 'faint', text: 'Carregando...' }));
    const atual = eu().plano.id; const demo = planos.cobranca === 'demo';
    const contrata = async (p) => {
      if (!(await confirmar(`Contratar o plano ${p.nome} (demonstração)`, `Ativar o plano ${p.nome} por 1 mês. Nenhuma cobrança real será feita neste ambiente.`, 'Ativar'))) return;
      try { await api('/v1/assinatura/checkout', { method: 'POST', body: { plano_id: p.id, meses: 1 } }); toast(`Plano ${p.nome} ativado.`, 'ok'); await recarregaTudo(); } catch (err) { toast(err.message, 'bad'); }
    };
    return sec('planos', 'Comparar planos', planos.hipotese,
      h('div', { class: 'grid auto' }, planos.planos.map((p) => h('div', { class: 'card stack', style: p.id === atual ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 3px var(--accent-soft)' } : {} },
        h('div', { class: 'row sb' }, h('h3', { text: p.nome }), p.id === atual ? h('span', { class: 'chip acc', text: 'Seu plano' }) : null),
        h('div', { class: 'kpi' }, h('span', { class: 'v', text: p.preco_mensal_brl === null ? 'Sob consulta' : p.preco_mensal_brl === 0 ? 'Grátis' : `R$ ${fmtNum(p.preco_mensal_brl)}` }), h('span', { class: 'l', text: p.preco_mensal_brl ? 'por mês (ilustrativo)' : p.destaque })),
        h('div', { class: 'muted', text: p.descricao }), h('ul', null, p.recursos.map((r) => h('li', { text: r }))),
        p.id === atual ? null : p.preco_mensal_brl === null ? h('button', { class: 'btn', type: 'button', onclick: () => go.abrirServicos(), text: 'Falar com a equipe' }) : p.nivel === 0 ? null : h('button', { class: 'btn primary', type: 'button', disabled: !demo || !admin(), title: demo ? '' : 'Contratação online indisponível neste ambiente', onclick: () => contrata(p), text: demo ? 'Contratar (demonstração)' : 'Em breve' })))));
  }

  const NAV = [['plano', 'Plano'], ['codigo', 'Código do livro'], ['creditos', 'Créditos'], ['byok', 'Chave própria'], ['uso', 'Uso'], ['planos', 'Comparar planos']];
  function desenha() {
    mount(raiz, h('div', null, h('h1', { text: 'Plano e uso' }), h('p', { class: 'muted', text: 'Gerencie o acesso, os créditos, a chave própria de IA e acompanhe o consumo.' })),
      h('div', { class: 'row wrap' }, NAV.map(([id, rot]) => h('button', { class: 'chip', type: 'button', onclick: () => vaiPara(id), text: rot }))),
      secPlano(), secCodigo(), secCreditos(), secByok(), secUso(), secPlanos());
  }
  function vaiPara(id) { document.getElementById('plano-sec-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  async function carrega() {
    try { [planos, uso, extrato] = await Promise.all([api('/v1/planos'), api('/v1/uso'), api('/v1/creditos')]); } catch { /* mostra o que houver */ }
    desenha();
  }
  async function recarregaTudo() { emit('eu:recarregar'); await new Promise((r) => setTimeout(r, 300)); await carrega(); }
  carrega(); on('eu:mudou', () => { if (el.isConnected && !el.hidden) desenha(); });
  return { vaiPara, aoAtivar: carrega };
}
