// Resultado de uma execução: andamento, documento, conferência numérica, validação humana e exportação.
import { h, api, S, mount, icon, emit, fmtData, fmtNum, md, copiar, baixar, rotuloNivel, FONTES, DECISOES, rotuloSetor, rotuloFase } from '../core.js';
import { toast, modal } from '../ui.js';
import * as go from '../go.js';
import { renomeia } from '../nav.js';

const ETAPAS = [['verificando_numeros', 'Calculando os números por código'], ['consultando_modelo', 'Consultando o modelo de IA'], ['conferindo_numeros', 'Conferindo os números do modelo'], ['concluida', 'Concluída']];
const STATUS_CONF = { confere: ['ok', 'Confere'], diverge: ['bad', 'Diverge'], nao_reportado: ['warn', 'Não reportado'] };

export default function execucao(tab, el) {
  const id = tab.dados.execId;
  const raiz = h('div', { class: 'wrap' }); el.append(raiz);
  let ex = null; let timer = null; let secValid = null;
  const form = { decisao: 'aprovada', nome: S.eu.usuario.nome, papel: '', just: '', inst: '', cond: '', check: {} };

  async function carrega() {
    try { ex = await api('/v1/execucoes/' + id); } catch (e) { mount(raiz, h('div', { class: 'callout bad' }, icon('alert'), e.message)); return; }
    renomeia(tab.id, ex.prompt_titulo.length > 28 ? ex.prompt_titulo.slice(0, 27) + '…' : ex.prompt_titulo);
    desenha(); emit('guia:atualizar');
    clearTimeout(timer);
    if (ex.status === 'em_andamento') timer = setTimeout(carrega, 1500);
    else { emit('exec:mudou'); emit('eu:recarregar'); }
  }

  function cabecalho() {
    const st = { concluida: ['ok', 'Concluída'], erro: ['bad', 'Erro'], em_andamento: ['info', 'Em andamento'] }[ex.status];
    const v = ex.validacao ? DECISOES[ex.validacao] : null;
    return h('div', null,
      h('div', { class: 'row wrap' }, h('span', { class: 'chip ' + st[0], text: st[1] }), h('span', { class: 'chip', text: FONTES[ex.fonte_ia] }), ex.fonte_ia !== 'simulado' ? h('span', { class: 'chip', text: ex.modelo }) : null,
        h('span', { class: 'chip', text: `Dados: ${ex.classificacao_dados}` }), h('span', { class: 'chip', text: fmtData(ex.criado_em) }), ex.usuario ? h('span', { class: 'chip', text: ex.usuario }) : null,
        v ? h('span', { class: 'chip ' + (ex.validacao === 'rejeitada' ? 'bad' : ex.validacao === 'aprovada' ? 'ok' : 'warn') }, icon('check'), v) : (ex.status === 'concluida' ? h('span', { class: 'chip warn', text: 'Aguardando validação humana' }) : null)),
      h('h1', { class: 'sp8', text: ex.saida?.titulo || ex.prompt_titulo }),
      h('div', { class: 'faint', text: `${ex.prompt_titulo} (v${ex.prompt_versao})${ex.projeto_ref ? ' · ' + ex.projeto_ref : ''}` }));
  }

  function andamento() {
    const i = Math.max(0, ETAPAS.findIndex((e) => e[0] === ex.etapa));
    return h('div', { class: 'card sp12' }, h('h3', { text: 'Gerando a análise' }),
      h('div', { class: 'prog sp8', 'aria-live': 'polite' }, ETAPAS.map(([k, rot], j) => h('div', { class: 'it ' + (j < i ? 'done' : j === i ? 'now' : '') }, j < i ? icon('check') : j === i ? h('span', { class: 'spin' }) : h('span', { class: 'badge-dot' }), rot))),
      h('p', { class: 'faint sp12', text: 'Nos modelos mais avançados a análise pode levar alguns minutos. Você pode continuar usando o portal: o resultado fica salvo nesta aba e em Execuções.' }));
  }

  function documento() {
    const s = ex.saida; const lista = (tit, itens) => (itens && itens.length) ? h('details', { class: 'card sp8', open: tit === 'Dados ausentes' }, h('summary', null, h('b', { text: tit }), h('span', { class: 'faint', text: ` (${itens.length})` })), h('ul', null, itens.map((x) => h('li', { text: x })))) : null;
    return h('div', { class: 'card doc' },
      h('div', { class: 'callout warn' }, icon('alert'), h('div', { text: 'Rascunho analítico gerado por IA. Confira os números, valide com o responsável técnico e registre a decisão antes de usar em qualquer deliberação.' })),
      h('h2', { text: 'Resumo executivo' }), md(s.resumo_executivo),
      ...s.secoes.flatMap((x) => [h('h2', { text: x.titulo }), md(x.conteudo)]),
      ...s.tabelas.flatMap((t) => [h('h3', { text: t.titulo }), h('div', { class: 'tscroll' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, t.colunas.map((c) => h('th', { text: c })))), h('tbody', null, t.linhas.map((ln) => h('tr', null, ln.map((c) => h('td', { text: c })))))))]),
      s.recomendacoes.length ? h('h2', { text: 'Recomendações' }) : null, s.recomendacoes.length ? h('ul', null, s.recomendacoes.map((x) => h('li', { text: x }))) : null,
      h('h2', { text: 'Transparência da análise' }),
      lista('Dados ausentes', s.dados_ausentes), lista('Limitações e alertas', s.limitacoes_e_alertas), lista('Premissas', s.premissas), lista('Hipóteses e inferências', s.hipoteses_e_inferencias), lista('Dados fornecidos (usados na análise)', s.dados_fornecidos));
  }

  function conferencia() {
    const c = ex.conferencia || []; const ok = c.filter((x) => x.status === 'confere').length; const div = c.filter((x) => x.status === 'diverge').length;
    const mapa = Object.fromEntries((ex.verificacoes || []).map((v) => [v.id, v]));
    return h('div', { class: 'card' }, h('div', { class: 'row sb' }, h('h3', { text: 'Verificação numérica' }), h('span', { class: 'chip ' + (div ? 'bad' : 'ok'), text: c.length ? `${ok} de ${c.length} conferem` : 'sem cálculos' })),
      ex.fonte_ia === 'simulado' ? h('div', { class: 'callout info sp8' }, icon('info'), h('div', { text: 'Demonstração: o "modelo" apenas repete os valores calculados por código, então a conferência é trivial. Em execuções com IA, o portal compara o que o modelo realmente reportou.' })) : null,
      div ? h('div', { class: 'callout bad sp8' }, icon('alert'), h('div', { text: `${div} número(s) do modelo divergem do cálculo por código. Use o valor calculado e investigue antes de aprovar.` })) : null,
      c.length ? h('div', { class: 'tscroll sp8' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', { text: 'Indicador' }), h('th', { class: 'num', text: 'Código' }), h('th', { class: 'num', text: 'Modelo' }), h('th', { text: '' }))),
        h('tbody', null, c.map((x) => h('tr', null, h('td', { text: x.rotulo }), h('td', { class: 'num mono', text: x.esperado_exibicao }), h('td', { class: 'num mono', text: x.reportado === null ? '-' : fmtNum(x.reportado, Math.abs(x.reportado) < 10 ? 3 : 1) }), h('td', null, h('span', { class: 'chip ' + STATUS_CONF[x.status][0], text: STATUS_CONF[x.status][1] }))))))) : h('p', { class: 'faint', text: 'Este prompt não tem cálculos verificáveis nos dados informados.' }),
      (ex.verificacoes || []).some((v) => v.status !== 'calculado') ? h('p', { class: 'faint sp8', text: 'Alguns indicadores não puderam ser calculados por falta de dados (ex.: ETC não informado).' }) : null);
  }

  function validacao() {
    const feitas = ex.validacoes || [];
    const itens = ex.checklist_sugerido || [];
    secValid = h('div', { class: 'card', id: 'valid-' + id });
    const div = (ex.divergencias || 0) > 0;
    const hist = feitas.map((v) => h('div', { class: 'callout ' + (v.decisao === 'rejeitada' ? 'bad' : v.decisao === 'aprovada' ? 'ok' : 'warn') }, icon('check'), h('div', null,
      h('b', { text: `${DECISOES[v.decisao]} por ${v.validador_nome} (${v.validador_papel})` }), h('div', { class: 'faint', text: fmtData(v.criado_em) }),
      v.justificativa ? h('div', { text: v.justificativa }) : null, v.instancia_decisoria ? h('div', null, h('b', { text: 'Instância decisória: ' }), v.instancia_decisoria) : null, v.condicionantes ? h('div', null, h('b', { text: 'Condicionantes: ' }), v.condicionantes) : null)));
    const inp = (k, rot, extra = {}, area = false) => { const c = h(area ? 'textarea' : 'input', { class: 'inp', id: `vf-${k}`, ...(area ? { rows: 2 } : { type: 'text' }), ...extra, oninput: (e) => { form[k] = e.target.value; } }); c.value = form[k] ?? ''; return h('div', { class: 'field' }, h('label', { for: `vf-${k}`, text: rot }), c); };
    mount(secValid, h('h3', { text: 'Validação humana' }),
      h('p', { class: 'muted', text: 'Registre quem revisou, o que conferiu e a decisão. Este registro compõe o Registro de Auditoria de IA.' }),
      ...hist,
      h('div', { class: 'stack sp8' },
        feitas.length ? h('b', { text: 'Registrar nova validação' }) : null,
        itens.length ? h('div', { class: 'field' }, h('label', { text: 'Checklist de validação' }), itens.map((t, i) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!form.check[i], onchange: (e) => { form.check[i] = e.target.checked; } }), h('span', { text: t })))) : null,
        h('div', { class: 'field' }, h('label', { text: 'Decisão' }),
          [['aprovada', 'Aprovada'], ['aprovada_com_ressalvas', 'Aprovada com ressalvas'], ['rejeitada', 'Rejeitada']].map(([v, r]) => h('label', { class: 'check' }, h('input', { type: 'radio', name: 'dec-' + id, checked: form.decisao === v, onchange: () => { form.decisao = v; } }), h('span', { text: r })))),
        h('div', { class: 'grid g2' }, inp('nome', 'Quem validou', { autocomplete: 'name' }), inp('papel', 'Papel ou cargo', { list: 'papeis-' + id, placeholder: (ex.papeis_sugeridos || [])[0] || 'Ex.: Controlador de projetos' })),
        h('datalist', { id: 'papeis-' + id }, (ex.papeis_sugeridos || []).map((p) => h('option', { value: p }))),
        inp('just', div ? 'Justificativa (obrigatória: há divergência numérica)' : 'Justificativa (obrigatória para ressalvas e rejeição)', {}, true),
        inp('inst', 'Instância decisória (ex.: Comitê de Investimento)'), inp('cond', 'Condicionantes', {}, true),
        h('div', null, h('button', { class: 'btn primary', type: 'button', onclick: registra }, icon('check'), 'Registrar validação'))));
  }
  async function registra() {
    const checklist = (ex.checklist_sugerido || []).map((t, i) => ({ item: t, ok: !!form.check[i] }));
    try {
      ex = await api(`/v1/execucoes/${id}/validacao`, { method: 'POST', body: { decisao: form.decisao, validador_nome: form.nome, validador_papel: form.papel, checklist, justificativa: form.just, instancia_decisoria: form.inst, condicionantes: form.cond } });
      toast('Validação registrada.', 'ok'); form.just = form.cond = form.inst = ''; form.check = {}; emit('exec:mudou'); desenha(); emit('guia:atualizar');
    } catch (e) { toast(e.message, 'bad', 7000); }
  }

  function detalhes() {
    return h('div', { class: 'card' }, h('h3', { text: 'Exportar e auditar' }),
      h('div', { class: 'stack sp8' },
        h('button', { class: 'btn', type: 'button', onclick: exportarHtml }, icon('download'), 'Documento (HTML para imprimir ou PDF)'),
        h('button', { class: 'btn', type: 'button', onclick: exportarMd }, icon('download'), 'Documento (Markdown)'),
        h('button', { class: 'btn', type: 'button', onclick: exportarAuditoria }, icon('shield'), 'Registro de Auditoria de IA (JSON)'),
        h('button', { class: 'btn', type: 'button', onclick: () => modal({ titulo: 'Prompt enviado ao modelo', wide: true, corpo: h('pre', { class: 'rctif mono', text: ex.prompt_renderizado }) , botoes: [{ label: 'Fechar' }] }) }, icon('eye'), 'Ver o prompt enviado')),
      h('div', { class: 'faint sp12', text: ex.fonte_ia === 'simulado' ? 'Demonstração: nenhum modelo foi consultado e nada foi cobrado.' : `Tokens: ${fmtNum(ex.tokens_in)} de entrada e ${fmtNum(ex.tokens_out)} de saída · custo do provedor US$ ${fmtNum(ex.custo_usd, 4)} · ${ex.fonte_ia === 'creditos' ? fmtNum(ex.creditos_cobrados) + ' créditos cobrados' : 'sem cobrança de créditos (chave própria)'}` }));
  }
  const exportarHtml = () => { if (ex?.status === 'concluida') window.open(`/v1/execucoes/${id}/exportar?formato=html`, '_blank', 'noopener'); };
  async function baixaDe(url, nome, tipo) {
    const r = await api(url, { raw: true });
    if (!r.ok) { let m = 'Não foi possível exportar.'; try { const d = await r.json(); m = typeof d.detail === 'string' ? d.detail : (d.detail?.mensagem || m); } catch { /* sem corpo */ } toast(m, 'bad'); return; }
    baixar(await r.blob(), nome, tipo);
  }
  const exportarMd = () => ex?.status === 'concluida' && baixaDe(`/v1/execucoes/${id}/exportar?formato=md`, `iapm-${id.slice(0, 8)}.md`, 'text/markdown');
  const exportarAuditoria = () => ex?.status === 'concluida' && baixaDe(`/v1/execucoes/${id}/auditoria`, `iapm-auditoria-${id.slice(0, 8)}.json`, 'application/json');

  function desenha() {
    const partes = [cabecalho()];
    if (ex.status === 'em_andamento') partes.push(andamento());
    else if (ex.status === 'erro') partes.push(h('div', { class: 'callout bad sp12' }, icon('alert'), h('div', null, h('b', { text: 'Não foi possível concluir a análise. ' }), ex.erro, h('div', { class: 'sp8' }, 'Nenhum crédito foi cobrado. ', h('button', { class: 'btn sm', type: 'button', onclick: () => go.abrirPrompt(ex.prompt_id), text: 'Voltar ao prompt' })))));
    else { validacao(); partes.push(h('div', { class: 'split sp12' }, documento(), h('div', { class: 'stack' }, conferencia(), secValid, detalhes()))); }
    mount(raiz, ...partes);
  }
  carrega();
  return {
    acoes: {
      validar: { run: () => { secValid?.scrollIntoView({ behavior: 'smooth', block: 'center' }); document.getElementById('vf-papel')?.focus(); }, ok: () => ex?.status === 'concluida' },
      exportarHtml: { run: exportarHtml, ok: () => ex?.status === 'concluida' },
      exportarMd: { run: exportarMd, ok: () => ex?.status === 'concluida' },
      exportarAuditoria: { run: exportarAuditoria, ok: () => ex?.status === 'concluida' },
    },
    guia: () => {
      if (!ex) return { titulo: 'Execução', intro: 'Carregando...' };
      const validada = !!ex.validacao; const feito = ex.status === 'concluida';
      return { titulo: 'Resultado da análise', intro: ex.status === 'em_andamento' ? 'A análise está sendo gerada. Esta tela atualiza sozinha.' : ex.status === 'erro' ? 'Algo impediu a conclusão. Veja a mensagem e tente de novo.' : 'Leia, confira os números, valide e exporte.',
        passos: [{ t: 'Leia a análise', d: 'Resumo, seções, tabelas e a transparência (dados ausentes e premissas).', estado: feito ? 'done' : 'now' }, { t: 'Confira os números', d: 'Compare o cálculo por código com o que o modelo reportou.', estado: feito ? (validada ? 'done' : 'now') : '' }, { t: 'Registre a validação', d: 'Quem revisou, o checklist e a decisão.', estado: validada ? 'done' : '' }, { t: 'Exporte', d: 'HTML para imprimir ou PDF, Markdown ou o Registro de Auditoria em JSON.', estado: '' }],
        acoes: feito ? [{ rotulo: validada ? 'Registrar nova validação' : 'Ir para a validação', primario: !validada, run: () => secValid?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }, { rotulo: 'Exportar documento', run: exportarHtml }] : [],
        dicas: ['Divergência numérica exige justificativa para aprovar.', 'Aprovação sem ressalvas exige marcar todo o checklist.'] };
    },
    aoFechar: () => clearTimeout(timer),
  };
}
