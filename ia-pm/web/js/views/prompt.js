// Tela de um prompt: formulário guiado, números calculados ao vivo, configuração da IA e execução.
import { h, api, S, store, mount, clear, icon, emit, on, debounce, fmtNum, rotuloSetor, rotuloFase, rotuloDisc, rotuloSetorCurto, rotuloNivel, copiar, ApiError } from '../core.js';
import { toast, modal } from '../ui.js';
import * as go from '../go.js';
import { renomeia } from '../nav.js';

const NUM = new Set(['numero', 'moeda', 'percentual']);
const RISCO = { baixo: ['ok', 'Risco de uso baixo'], medio: ['warn', 'Risco de uso médio'], alto: ['bad', 'Risco de uso alto'] };
const numTxt = (n) => (n === null || n === undefined ? '' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 4, useGrouping: false }));
const vazio = (v) => v === undefined || v === null || (typeof v === 'string' && !v.trim());

export default function prompt(tab, el) {
  const pid = tab.dados.promptId;
  const raiz = h('div', { class: 'wrap' });
  el.append(raiz);
  const st = {
    p: null, valores: {}, tocados: new Set(), erros: {}, previa: null, sub: 'executar', executando: false, mostrarTodos: false,
    cfg: { fonte: null, nivel: null, classificacao: '', finalidade: '', projeto: '' }, estNiveis: {}, ultimaExec: null, verPronto: false,
  };
  const draftKey = 'form.' + pid;

  // ------------------------------------------------------------ dados
  async function carrega() {
    mount(raiz, h('div', { class: 'empty' }, h('div', { class: 'spin', style: { margin: '0 auto 10px' } }), 'Carregando o prompt...'));
    try { st.p = await api('/v1/prompts/' + encodeURIComponent(pid)); } catch (e) { mount(raiz, h('div', { class: 'callout bad' }, icon('alert'), e.message)); return; }
    const rasc = store.get(draftKey);
    for (const d of st.p.variaveis) st.valores[d.nome] = d.tipo === 'tabela' ? linhasVazias(d) : '';
    if (rasc && rasc.valores) Object.assign(st.valores, rasc.valores);
    st.cfg = { fonte: null, nivel: st.p.modelo_recomendado || 'avancado', classificacao: '', finalidade: st.p.decisao_apoiada || '', projeto: '', ...(rasc?.cfg || {}) };
    if (tab.dados.fonte) st.cfg.fonte = tab.dados.fonte;
    if (!st.cfg.fonte) st.cfg.fonte = fonteAuto();
    if (tab.dados.exemplo) { exemplo(false); delete tab.dados.exemplo; }
    desenha(); atualizaPrevia(); carregaEstimativas();
  }
  const linhasVazias = (d) => Array.from({ length: d.min_linhas || 1 }, () => Object.fromEntries(d.colunas.map((c) => [c.nome, ''])));
  function fonteAuto() {
    const e = S.eu;
    if (e.byok.configurado) return 'byok';
    if (e.ambiente.creditos_gerenciados && e.creditos > 0) return 'creditos';
    return 'simulado';
  }
  async function carregaEstimativas() {
    if (!st.p.acesso) return;
    for (const n of S.cat.modelos) {
      try { st.estNiveis[n.id] = await api(`/v1/modelos/estimativa?prompt_id=${encodeURIComponent(pid)}&nivel=${n.id}`); } catch { /* segue */ }
    }
    if (st.sub === 'executar') desenhaConfig();
  }
  const salvaRascunho = debounce(() => store.set(draftKey, { valores: st.valores, cfg: st.cfg }), 400);

  function limpaVazios() {
    const out = {};
    for (const d of st.p.variaveis) {
      const v = st.valores[d.nome];
      if (d.tipo === 'tabela') {
        const linhas = v.filter((ln) => Object.values(ln).some((x) => !vazio(x)));
        out[d.nome] = linhas.length ? linhas : [];
      } else if (!vazio(v)) out[d.nome] = v;
    }
    return out;
  }
  async function previaAgora() {
    if (!st.p || !st.p.acesso) return;
    try {
      st.previa = await api(`/v1/prompts/${encodeURIComponent(pid)}/previa`, { method: 'POST', body: { variaveis: limpaVazios(), nivel_modelo: st.cfg.nivel } });
      st.erros = st.previa.campos || {};
    } catch (e) { toast(e.message, 'bad'); }
    desenhaVerif(); desenhaConfig(); desenhaStepper(); emit('guia:atualizar');
  }
  const atualizaPrevia = debounce(previaAgora, 500);
  const mudou = () => { salvaRascunho(); atualizaPrevia(); };

  // ------------------------------------------------------------ progresso
  const faltam = () => Object.keys(st.erros).length;
  const dadosOk = () => st.previa && st.previa.valido;
  const cfgOk = () => !!st.cfg.classificacao && !!st.cfg.fonte;
  function passoAtual() { if (st.ultimaExec) return 4; if (!dadosOk()) return 1; if (!cfgOk()) return 2; return 3; }

  // ------------------------------------------------------------ campos
  function campo(d) {
    const id = `v-${pid}-${d.nome}`.replace(/[^\w-]/g, '_');
    const erro = (st.tocados.has(d.nome) || st.mostrarTodos) ? st.erros[d.nome] : null;
    const rot = h('label', { for: id }, d.rotulo, d.obrigatoria === false ? h('span', { class: 'faint', text: ' (opcional)' }) : null);
    let ctl;
    if (d.tipo === 'tabela') {
      ctl = tabela(d, id);
    } else if (d.tipo === 'texto_longo') {
      ctl = h('textarea', { class: 'inp' + (erro ? ' bad' : ''), id, rows: 3, placeholder: d.padrao ? String(d.padrao).slice(0, 140) : '', oninput: (e) => entrada(d, e.target.value), onblur: () => toque(d) }); ctl.value = st.valores[d.nome] ?? '';
    } else if (d.tipo === 'selecao') {
      ctl = h('select', { class: 'inp' + (erro ? ' bad' : ''), id, onchange: (e) => entrada(d, e.target.value) }, h('option', { value: '', text: 'Selecione...' }), ...d.opcoes.map((o) => { const v = o.valor ?? o; return h('option', { value: v, selected: st.valores[d.nome] === v, text: o.rotulo ?? o }); }));
    } else {
      const inp = h('input', { class: 'inp' + (erro ? ' bad' : ''), id, type: d.tipo === 'data' ? 'date' : 'text', inputmode: NUM.has(d.tipo) ? 'decimal' : 'text', autocomplete: 'off',
        placeholder: d.padrao !== undefined && d.padrao !== null ? (NUM.has(d.tipo) ? numTxt(d.padrao) : String(d.padrao)) : '', oninput: (e) => entrada(d, e.target.value), onblur: () => toque(d) });
      inp.value = st.valores[d.nome] ?? '';
      ctl = d.unidade ? h('div', { class: 'adorn' }, inp, h('span', { class: 'u', text: d.unidade })) : inp;
    }
    return h('div', { class: 'field' }, rot, ctl, d.ajuda ? h('div', { class: 'help', text: d.ajuda }) : null, erro ? h('div', { class: 'err', role: 'alert', text: erro }) : null);
  }
  function entrada(d, v) { st.valores[d.nome] = v; mudou(); }
  function toque(d) { if (!st.tocados.has(d.nome)) { st.tocados.add(d.nome); desenhaForm(); } }

  function tabela(d, id) {
    const linhas = st.valores[d.nome];
    const box = h('div', { class: 'tscroll' });
    const tb = h('table', { class: 'tbl', 'aria-label': d.rotulo });
    tb.append(h('thead', null, h('tr', null, ...d.colunas.map((c) => h('th', { class: NUM.has(c.tipo) ? 'num' : '', text: c.rotulo })), h('th'))));
    const corpo = h('tbody');
    linhas.forEach((ln, i) => {
      const ex = Array.isArray(d.padrao) ? d.padrao[i] : null;
      corpo.append(h('tr', null, ...d.colunas.map((c) => {
        const inp = h('input', { class: 'inp' + (NUM.has(c.tipo) ? ' num' : ''), type: 'text', inputmode: NUM.has(c.tipo) ? 'decimal' : 'text', 'aria-label': `${c.rotulo}, linha ${i + 1}`,
          placeholder: ex && ex[c.nome] !== undefined && ex[c.nome] !== null ? (NUM.has(c.tipo) ? numTxt(ex[c.nome]) : String(ex[c.nome]).slice(0, 40)) : '',
          style: { minWidth: c.tipo === 'texto' ? '150px' : '90px', textAlign: NUM.has(c.tipo) ? 'right' : 'left' },
          oninput: (e) => { ln[c.nome] = e.target.value; mudou(); }, onblur: () => toque(d) });
        inp.value = ln[c.nome] ?? '';
        return h('td', null, inp);
      }), h('td', null, linhas.length > (d.min_linhas || 1) ? h('button', { class: 'btn ghost sm', type: 'button', title: 'Remover linha', 'aria-label': `Remover linha ${i + 1}`, onclick: () => { linhas.splice(i, 1); mudou(); desenhaForm(); } }, icon('trash')) : null)));
    });
    tb.append(corpo); box.append(tb);
    const max = d.max_linhas || 30;
    return h('div', null, box, h('button', { class: 'btn sm sp8', type: 'button', disabled: linhas.length >= max, onclick: () => { linhas.push(Object.fromEntries(d.colunas.map((c) => [c.nome, '']))); mudou(); desenhaForm(); } }, icon('plus'), 'Adicionar linha'));
  }

  // ------------------------------------------------------------ ações
  function exemplo(redesenha = true) {
    for (const d of st.p.variaveis) {
      if (d.padrao === undefined || d.padrao === null) { st.valores[d.nome] = d.tipo === 'tabela' ? linhasVazias(d) : ''; continue; }
      if (d.tipo === 'tabela') st.valores[d.nome] = d.padrao.map((ln) => Object.fromEntries(d.colunas.map((c) => [c.nome, ln[c.nome] === null || ln[c.nome] === undefined ? '' : (NUM.has(c.tipo) ? numTxt(ln[c.nome]) : String(ln[c.nome]))])));
      else st.valores[d.nome] = NUM.has(d.tipo) ? numTxt(d.padrao) : String(d.padrao);
    }
    st.tocados.clear(); mudou();
    if (redesenha) { desenhaForm(); toast('Exemplo do livro carregado. Confira os números calculados ao lado.', 'ok'); }
  }
  async function limpar() {
    for (const d of st.p.variaveis) st.valores[d.nome] = d.tipo === 'tabela' ? linhasVazias(d) : '';
    st.tocados.clear(); st.mostrarTodos = false; store.del(draftKey); mudou(); desenhaForm();
  }
  async function pedePronto() {
    try { const r = await api(`/v1/prompts/${encodeURIComponent(pid)}/renderizar`, { method: 'POST', body: { variaveis: limpaVazios(), nivel_modelo: st.cfg.nivel } }); return r.prompt; }
    catch (e) { if (e.campos) { st.erros = e.campos; st.mostrarTodos = true; desenhaForm(); toast('Preencha os campos obrigatórios para gerar o prompt pronto.', 'warn'); } else toast(e.message, 'bad'); return null; }
  }
  async function copiarPronto() { const t = await pedePronto(); if (t) toast((await copiar(t)) ? 'Prompt pronto copiado. Cole na ferramenta de IA que preferir.' : 'Não foi possível copiar.', 'ok'); }
  async function verPronto() {
    const t = await pedePronto(); if (!t) return;
    modal({ titulo: 'Prompt pronto (formato RCTIF)', wide: true, corpo: h('div', { class: 'stack' }, h('p', { class: 'muted', text: 'É exatamente o que o portal envia à IA, mais as regras da plataforma. Você também pode colar este texto em qualquer ferramenta.' }), h('pre', { class: 'rctif mono', text: t })),
      botoes: [{ label: 'Copiar', primary: true, onclick: async () => { toast((await copiar(t)) ? 'Copiado.' : 'Falha ao copiar.', 'ok'); return false; } }, { label: 'Fechar' }] });
  }
  async function executar() {
    if (!st.p.acesso) { toast('Este prompt faz parte do nível Leitor.', 'warn'); st.sub = 'executar'; desenha(); return; }
    if (st.executando) return;
    st.mostrarTodos = true;
    await previaAgora();
    if (!dadosOk()) { desenhaForm(); toast(`Faltam dados: corrija ${faltam()} campo(s) destacado(s).`, 'warn'); document.querySelector('.err')?.scrollIntoView({ block: 'center' }); return; }
    if (!st.cfg.classificacao) { desenhaConfig(); toast('Escolha a classificação dos dados antes de executar.', 'warn'); return; }
    if (st.cfg.fonte === 'byok' && !S.eu.byok.configurado) { toast('Configure a sua chave de API para usar chave própria.', 'warn'); go.abrirPlano('byok'); return; }
    st.executando = true; desenhaConfig();
    try {
      const ex = await api(`/v1/prompts/${encodeURIComponent(pid)}/executar`, { method: 'POST', body: {
        variaveis: limpaVazios(), classificacao_dados: st.cfg.classificacao, finalidade: st.cfg.finalidade, projeto_ref: st.cfg.projeto, fonte_ia: st.cfg.fonte, nivel_modelo: st.cfg.nivel } });
      st.ultimaExec = ex.id; store.set('fonte', st.cfg.fonte);
      toast(st.cfg.fonte === 'simulado' ? 'Demonstração gerada.' : 'Execução iniciada. Acompanhe na nova aba.', 'ok');
      emit('exec:mudou'); go.abrirExecucao(ex.id, st.p.titulo); desenhaStepper(); emit('guia:atualizar');
    } catch (e) {
      if (e.campos) { st.erros = e.campos; st.mostrarTodos = true; desenhaForm(); }
      toast(e.message, 'bad', 7000);
      if (e.codigo === 'saldo_insuficiente') go.abrirPlano('creditos');
    } finally { st.executando = false; desenhaConfig(); }
  }

  // ------------------------------------------------------------ desenho
  let secForm; let secConfig; let secVerif; let secStepper; let secSub;
  function desenhaStepper() {
    if (!secStepper) return;
    const p = passoAtual();
    const nomes = ['Preencher os dados', 'Configurar a IA', 'Executar', 'Validar e exportar'];
    mount(secStepper, ...nomes.map((n, i) => h('div', { class: 'step ' + (p === i + 1 ? 'now' : p > i + 1 ? 'done' : '') }, h('span', { class: 'n' }, p > i + 1 ? icon('check') : String(i + 1)), n)));
  }
  function desenhaForm() {
    if (!secForm) return;
    const sy = el.scrollTop;
    mount(secForm,
      h('div', { class: 'row sb' }, h('h3', { text: 'Dados do projeto' }), h('div', { class: 'row' },
        h('button', { class: 'btn sm', type: 'button', onclick: () => exemplo(), title: 'Alt+X' }, icon('book'), 'Exemplo do livro'),
        h('button', { class: 'btn sm ghost', type: 'button', onclick: limpar }, 'Limpar'))),
      h('p', { class: 'muted', text: 'Os campos cinza mostram um exemplo. Valores numéricos aceitam vírgula ou ponto (ex.: 1.234,56). O portal salva o seu rascunho neste navegador.' }),
      h('div', { class: 'stack sp8' }, st.p.variaveis.map(campo)));
    el.scrollTop = sy;
  }
  function opcaoFonte(id, titulo, sub, desabilitado, motivo) {
    return h('label', { class: 'choice' + (st.cfg.fonte === id ? ' on' : '') + (desabilitado ? ' off' : '') },
      h('input', { type: 'radio', name: 'fonte-' + pid, checked: st.cfg.fonte === id, disabled: desabilitado, onchange: () => { st.cfg.fonte = id; mudou(); desenhaConfig(); } }),
      h('div', null, h('div', { class: 'ttl', text: titulo }), h('div', { class: 'sub', text: desabilitado ? motivo : sub })));
  }
  function desenhaConfig() {
    if (!secConfig) return;
    const e = S.eu; const est = st.previa?.estimativa;
    const nv = (id) => st.estNiveis[id] || null;
    const cl = S.cat.taxonomia.classificacao_dados.find((c) => c.id === st.cfg.classificacao);
    const restrita = st.cfg.classificacao === 'restrita';
    const f = st.cfg.fonte;
    const idSeguro = pid.replace(/[^\w-]/g, '_');
    const finEl = h('textarea', { class: 'inp', id: 'fin-' + idSeguro, rows: 2, oninput: (ev) => { st.cfg.finalidade = ev.target.value; salvaRascunho(); } });
    finEl.value = st.cfg.finalidade || '';
    const projEl = h('input', { class: 'inp', id: 'proj-' + idSeguro, type: 'text', placeholder: 'Ex.: Parque Eólico Ventos do Sul', oninput: (ev) => { st.cfg.projeto = ev.target.value; salvaRascunho(); } });
    projEl.value = st.cfg.projeto || '';
    mount(secConfig,
      h('h3', { text: 'Como executar' }),
      h('div', { class: 'field sp8' }, h('label', { text: '1. Fonte da IA' }),
        opcaoFonte('creditos', `Créditos da plataforma (saldo ${fmtNum(e.creditos)})`, est ? `Custo estimado: cerca de ${est.creditos} créditos (faixa ${est.creditos_min} a ${est.creditos_max}).` : 'O custo é estimado depois que os dados forem válidos.', !e.ambiente.creditos_gerenciados || e.creditos <= 0, !e.ambiente.creditos_gerenciados ? 'Indisponível neste ambiente.' : 'Sem saldo. Resgate o código do livro ou compre créditos.'),
        opcaoFonte('byok', e.byok.configurado ? `Minha chave de API (••••${e.byok.final})` : 'Minha chave de API (BYOK)', 'O custo vai direto para a sua conta no provedor. Nada é cobrado em créditos.', !e.byok.configurado || !e.plano.byok, 'Configure a sua chave em Plano e uso.'),
        opcaoFonte('simulado', 'Demonstração (sem IA, sem custo)', 'Mostra a estrutura da entrega com os seus dados e os números calculados por código.', false, ''),
        !e.byok.configurado ? h('button', { class: 'btn ghost sm', type: 'button', onclick: () => go.abrirPlano('byok') }, icon('key'), 'Configurar chave própria') : null,
        e.creditos <= 0 && e.ambiente.creditos_gerenciados ? h('button', { class: 'btn ghost sm', type: 'button', onclick: () => go.abrirPlano('creditos') }, icon('card'), 'Obter créditos') : null),
      f !== 'simulado' ? h('div', { class: 'field sp12' }, h('label', { text: '2. Nível do modelo' }),
        ...S.cat.modelos.map((n) => h('label', { class: 'choice' + (st.cfg.nivel === n.id ? ' on' : '') },
          h('input', { type: 'radio', name: 'nivel-' + pid, checked: st.cfg.nivel === n.id, onchange: () => { st.cfg.nivel = n.id; mudou(); desenhaConfig(); } }),
          h('div', null, h('div', { class: 'ttl', text: `${n.nome}` }, h('span', { class: 'faint', text: `  ${n.modelo}` })), h('div', { class: 'sub', text: n.descricao }),
            nv(n.id) ? h('div', { class: 'sub', text: `Estimativa: ~${nv(n.id).creditos} créditos` }) : null)))) : h('div', { class: 'faint sp12', text: 'A demonstração não usa modelo de IA.' }),
      h('div', { class: 'field sp12' }, h('label', { for: 'cl-' + idSeguro, text: '3. Classificação dos dados informados' }),
        h('select', { class: 'inp' + (st.mostrarTodos && !st.cfg.classificacao ? ' bad' : ''), id: 'cl-' + idSeguro, onchange: (ev) => { st.cfg.classificacao = ev.target.value; mudou(); desenhaConfig(); } },
          h('option', { value: '', text: 'Selecione...' }), ...S.cat.taxonomia.classificacao_dados.map((c) => h('option', { value: c.id, selected: st.cfg.classificacao === c.id, text: c.nome }))),
        cl ? h('div', { class: 'help', text: cl.descricao }) : h('div', { class: 'help', text: 'Obrigatório: ajuda a evitar o envio de informação sensível à IA.' }),
        restrita && f !== 'simulado' ? h('div', { class: 'callout bad sp8' }, icon('alert'), h('div', { text: 'Dados restritos não podem ser enviados à IA. Anonimize as informações ou use a demonstração.' })) : null),
      h('div', { class: 'field sp12' }, h('label', { for: 'fin-' + idSeguro, text: 'Finalidade (para o registro de auditoria)' }), finEl),
      h('div', { class: 'field' }, h('label', { for: 'proj-' + idSeguro, text: 'Projeto ou ativo (opcional)' }), projEl),
      h('div', { class: 'row sp16 wrap' },
        h('button', { class: 'btn primary lg', type: 'button', disabled: st.executando || !st.p.acesso || (restrita && f !== 'simulado'), onclick: executar, title: 'Ctrl+Enter' }, st.executando ? h('span', { class: 'spin' }) : icon('play'), st.executando ? 'Executando...' : (f === 'simulado' ? 'Gerar demonstração' : 'Executar análise')),
        h('button', { class: 'btn', type: 'button', onclick: verPronto }, icon('eye'), 'Ver prompt'),
        h('button', { class: 'btn', type: 'button', onclick: copiarPronto }, icon('copy'), 'Copiar')),
      !dadosOk() && st.previa ? h('div', { class: 'faint sp8', text: `Faltam ou estão inválidos ${faltam()} campo(s).` }) : null);
  }
  function desenhaVerif() {
    if (!secVerif) return;
    const v = st.previa?.verificacoes || st.p.verificacoes.map((x) => ({ rotulo: x.rotulo, exibicao: '', status: 'indisponivel', motivo: '', id: x.id, nota: x.nota }));
    mount(secVerif,
      h('div', { class: 'row sb' }, h('h3', { text: 'Números calculados por código' }), h('span', { class: 'chip info', title: 'O modelo não faz estas contas: elas são feitas pelo sistema e depois conferidas.' }, icon('calc'), 'ao vivo')),
      h('p', { class: 'faint', text: 'Atualizam enquanto você digita. O modelo recebe estes valores prontos e, ao final, o portal confere o que ele reportou.' }),
      h('div', null, v.map((r) => h('div', { class: 'verif' }, h('span', { text: r.rotulo }),
        h('span', { class: 'v', text: r.status === 'calculado' ? r.exibicao : '...' }),
        r.status !== 'calculado' && r.motivo ? h('span', { class: 'n', text: r.motivo }) : (r.nota ? h('span', { class: 'n', text: r.nota }) : null)))));
  }

  function conteudoExecutar() {
    secStepper = h('div', { class: 'stepper' }); secForm = h('div', { class: 'card' }); secConfig = h('div', { class: 'card', style: { position: 'sticky', top: '0' } }); secVerif = h('div', { class: 'card' });
    desenhaStepper(); desenhaForm(); desenhaConfig(); desenhaVerif();
    return h('div', null, secStepper, !st.p.acesso ? bloqueio() : null,
      h('div', { class: 'split sp8' }, h('div', { class: 'stack' }, secForm, secVerif), h('div', null, secConfig)));
  }
  function bloqueio() {
    return h('div', { class: 'callout warn' }, icon('lock'), h('div', null, h('b', { text: 'Prompt do nível Leitor. ' }), 'Você pode ver o formulário e entender o que ele entrega. Para executar e ler o texto completo, resgate o código do livro ou assine.',
      h('div', { class: 'row sp8' }, h('button', { class: 'btn primary sm', type: 'button', onclick: () => go.abrirPlano('codigo'), text: 'Resgatar código do livro' }), h('button', { class: 'btn sm', type: 'button', onclick: () => go.abrirPlano('planos'), text: 'Ver planos' }))));
  }
  function conteudoPrompt() {
    if (!st.p.acesso) return h('div', { class: 'stack' }, bloqueio(), h('div', { class: 'card' }, h('h3', { text: 'O que este prompt entrega' }), h('ul', null, (st.p.o_que_voce_recebe || []).map((x) => h('li', { text: x })))));
    const r = st.p.rctif; const nomes = [['papel', 'PAPEL'], ['contexto', 'CONTEXTO'], ['tarefa', 'TAREFA'], ['instrucoes', 'INSTRUÇÕES DE ANÁLISE E VERIFICAÇÃO'], ['formato', 'FORMATO DE SAÍDA']];
    return h('div', { class: 'stack' },
      h('div', { class: 'callout info' }, icon('info'), h('div', null, h('b', { text: 'Framework RCTIF. ' }), 'Os trechos {{entre chaves}} são preenchidos com os dados do formulário. Além deste texto, o portal acrescenta as regras da plataforma (não inventar valores, separar fatos de hipóteses, valores calculados por código) e exige saída estruturada.')),
      ...nomes.map(([k, rot]) => h('div', null, h('span', { class: 'rctif-tag', text: rot }), h('div', { class: 'rctif', text: r[k] }))),
      h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: async () => toast((await copiar(nomes.map(([k, rot]) => `[${rot}]\n${r[k]}`).join('\n\n'))) ? 'Modelo do prompt copiado.' : 'Falha ao copiar.', 'ok') }, icon('copy'), 'Copiar o modelo (com {{variáveis}})'), h('button', { class: 'btn', type: 'button', onclick: verPronto }, icon('eye'), 'Ver com os meus dados')));
  }
  function conteudoVerif() {
    return h('div', { class: 'stack' },
      h('div', { class: 'callout info' }, icon('calc'), h('div', null, h('b', { text: 'Como funciona a verificação numérica. ' }), 'Cada indicador abaixo é calculado por código a partir dos seus dados, antes de a IA ser consultada. A IA recebe o valor pronto e deve reportá-lo. Ao final, o portal compara: "confere", "diverge" ou "não reportado". Divergências bloqueiam a aprovação sem justificativa.')),
      h('div', { class: 'tscroll' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', { text: 'Indicador' }), h('th', { text: 'Unidade' }), h('th', { text: 'Fórmula' }), h('th', { text: 'Observação' }))),
        h('tbody', null, st.p.verificacoes.map((v) => h('tr', null, h('td', { text: v.rotulo + (v.por_linha ? ' (por linha)' : '') }), h('td', { text: v.unidade || '' }), h('td', null, h('code', { text: v.formula || (st.p.acesso ? '' : 'nível Leitor') })), h('td', { text: v.nota || '' })))))));
  }
  function conteudoValidacao() {
    const vh = st.p.validacao_humana || {}; const r = RISCO[st.p.classificacao_risco_uso || 'medio'];
    return h('div', { class: 'stack' },
      h('div', { class: 'card' }, h('h3', { text: 'Avisos deste prompt' }), h('ul', null, (st.p.avisos || []).map((a) => h('li', { text: a })))),
      h('div', { class: 'card' }, h('div', { class: 'row sb' }, h('h3', { text: 'Validação humana' }), h('span', { class: 'chip ' + r[0], text: r[1] })),
        h('p', { class: 'muted', text: S.cat.taxonomia.risco_de_uso.find((x) => x.id === st.p.classificacao_risco_uso)?.descricao || '' }),
        h('div', null, h('b', { text: 'Quem costuma validar: ' }), (vh.papeis_sugeridos || []).join(', ') || 'responsável técnico'),
        h('b', { class: 'sp8', style: { display: 'block' }, text: 'Checklist sugerido:' }), h('ul', null, (vh.checklist || []).map((c) => h('li', { text: c })))),
      h('div', { class: 'card flat' }, h('div', { class: 'faint', text: `Origem: ${st.p.origem?.referencia || ''} do livro. Versão do prompt: ${st.p.versao}. A versão é gravada em cada execução, para auditoria.` })));
  }
  function desenhaSub() {
    const abas = [['executar', 'Executar'], ['prompt', 'Prompt (RCTIF)'], ['verif', 'Verificações'], ['validacao', 'Validação e avisos']];
    const corpo = st.sub === 'executar' ? conteudoExecutar() : st.sub === 'prompt' ? conteudoPrompt() : st.sub === 'verif' ? conteudoVerif() : conteudoValidacao();
    mount(secSub, h('div', { class: 'subtabs', role: 'tablist' }, abas.map(([id, rot]) => h('button', { class: 'subtab' + (st.sub === id ? ' on' : ''), type: 'button', role: 'tab', 'aria-selected': st.sub === id, onclick: () => { st.sub = id; desenhaSub(); }, text: rot }))), corpo);
  }
  function desenha() {
    const p = st.p; const r = RISCO[p.classificacao_risco_uso || 'medio'];
    secSub = h('div');
    mount(raiz,
      h('div', null,
        h('div', { class: 'row wrap' }, h('span', { class: 'chip acc', text: rotuloSetor(p.setor) }), h('span', { class: 'chip', text: rotuloFase(p.fase) }), ...p.disciplinas.map((d) => h('span', { class: 'chip', text: rotuloDisc(d) })),
          h('span', { class: 'chip ' + r[0], text: r[1] }), h('span', { class: 'chip', text: `v${p.versao}` }), p.acesso ? null : h('span', { class: 'chip warn' }, icon('lock'), 'Nível Leitor')),
        h('h1', { class: 'sp8', text: p.titulo }), h('p', { class: 'muted sp8', text: p.resumo }),
        h('div', { class: 'row wrap faint' }, h('span', null, h('b', { text: 'Decisão apoiada: ' }), p.decisao_apoiada), h('span', null, h('b', { text: 'Quando usar: ' }), p.quando_usar || '')),
        p.nao_use_para ? h('div', { class: 'callout warn sp8' }, icon('alert'), h('div', null, h('b', { text: 'Não use para: ' }), p.nao_use_para)) : null),
      secSub);
    desenhaSub(); renomeia(tab.id, p.titulo.length > 28 ? p.titulo.slice(0, 27) + '…' : p.titulo);
    emit('guia:atualizar');
  }

  carrega();
  return {
    acoes: {
      executar: { run: executar, ok: () => !!st.p && st.p.acesso },
      verPrompt: { run: verPronto, ok: () => !!st.p && st.p.acesso },
      copiarPrompt: { run: copiarPronto, ok: () => !!st.p && st.p.acesso },
      exemplo: { run: () => { st.sub = 'executar'; desenhaSub(); exemplo(); }, ok: () => !!st.p },
      limpar: { run: limpar, ok: () => !!st.p },
    },
    guia: () => {
      if (!st.p) return { titulo: 'Prompt', intro: 'Carregando...' };
      const p = passoAtual();
      const info = [['Preencha os dados', 'Use "Exemplo do livro" para ver um caso completo. Os números aparecem à direita enquanto você digita.'], ['Configure a IA', 'Escolha a fonte (créditos, sua chave ou demonstração) e a classificação dos dados.'], ['Execute', 'Pressione Ctrl+Enter ou o botão Executar. Uma nova aba acompanha o andamento.'], ['Valide e exporte', 'Na aba da execução, registre quem revisou e a decisão. Depois exporte.']];
      return { titulo: st.p.titulo, intro: st.p.acesso ? 'Siga os quatro passos. O portal avisa o que falta.' : 'Este prompt é do nível Leitor. Você pode explorar o formulário.',
        passos: info.map(([t, d], i) => ({ t, d, estado: p > i + 1 ? 'done' : p === i + 1 ? 'now' : '' })),
        acoes: st.p.acesso ? [{ rotulo: 'Carregar exemplo do livro', run: () => { st.sub = 'executar'; desenhaSub(); exemplo(); } }, { rotulo: 'Executar análise', primario: true, run: executar }] : [{ rotulo: 'Resgatar código do livro', primario: true, run: () => go.abrirPlano('codigo') }],
        dicas: ['Dados restritos nunca vão para a IA.', 'Sem chave nem créditos? A demonstração mostra a estrutura da entrega.'] };
    },
    aoAtivar: () => { if (st.p) { desenhaConfig(); desenhaStepper(); } },
  };
}
