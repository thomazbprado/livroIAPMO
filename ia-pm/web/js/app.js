// Shell do aplicativo: barra de título, menus, barra de ferramentas, atividades, abas, guia e barra de status.
import { h, $, api, S, store, mount, clear, icon, on, emit, fmtNum, iniciais, diasAte, baixar } from './core.js';
import { toast, modal, confirmar, abreMenu, menuBar, paleta, tour } from './ui.js';
import { iniciaNav, registraView, abrirAba, abaAtiva, fecharAba, fechaTodas, trocaAba, abaN, restaura, instancias } from './nav.js';
import { ATIVIDADES, renderSidebar } from './sidebar.js';
import * as go from './go.js';
import { mostraLogin } from './views/login.js';

import inicio from './views/inicio.js';
import assistente from './views/assistente.js';
import catalogo from './views/catalogo.js';
import prompt from './views/prompt.js';
import execucao from './views/execucao.js';
import execucoes from './views/execucoes.js';
import servicos from './views/servicos.js';
import plano from './views/plano.js';
import apiView from './views/api.js';
import config from './views/config.js';
import admin from './views/admin.js';
import ajuda, { mostraAtalhos, mostraAvisos, mostraSobre } from './views/ajuda.js';

for (const [t, f] of Object.entries({ inicio, assistente, catalogo, prompt, execucao, execucoes, servicos, plano, api: apiView, config, admin, ajuda })) registraView(t, f);

// ---------------------------------------------------------------- comandos
const acao = (nome) => abaAtiva()?.inst.acoes?.[nome];
const temAcao = (nome) => { const a = acao(nome); return !!(a && (a.ok ? a.ok() : true)); };
const roda = (nome) => { const a = acao(nome); if (a) a.run(); else toast('Este comando não se aplica à tela atual.', 'info'); };

export const COMANDOS = [
  { id: 'nova', label: 'Nova análise guiada', k: 'Alt+N', icone: 'compass', cat: 'Arquivo', run: () => go.abrirAssistente() },
  { id: 'inicio', label: 'Início', k: 'Alt+H', icone: 'home', cat: 'Ir para', run: () => go.abrirInicio() },
  { id: 'catalogo', label: 'Catálogo de prompts', k: 'Alt+L', icone: 'library', cat: 'Ir para', run: () => go.abrirCatalogo() },
  { id: 'execucoes', label: 'Execuções', k: 'Alt+E', icone: 'list', cat: 'Ir para', run: () => go.abrirExecucoes() },
  { id: 'servicos', label: 'Serviços de PMO e consultoria', icone: 'briefcase', cat: 'Ir para', run: () => go.abrirServicos() },
  { id: 'plano', label: 'Plano e uso', k: 'Alt+U', icone: 'card', cat: 'Ir para', run: () => go.abrirPlano() },
  { id: 'api', label: 'API e integrações', k: 'Alt+I', icone: 'code', cat: 'Ir para', run: () => go.abrirApi() },
  { id: 'config', label: 'Configurações', k: 'Alt+,', icone: 'gear', cat: 'Ir para', run: () => go.abrirConfig() },
  { id: 'admin', label: 'Administração da plataforma', icone: 'shield', cat: 'Ir para', run: () => go.abrirAdmin(), visivel: () => S.eu.usuario.is_staff },
  { id: 'fechar', label: 'Fechar aba', k: 'Alt+W', icone: 'x', cat: 'Arquivo', run: () => S.active && fecharAba(S.active), ok: () => !!S.active },
  { id: 'fechar_todas', label: 'Fechar todas as abas', icone: 'x', cat: 'Arquivo', run: () => fechaTodas(), ok: () => S.tabs.length > 0 },
  { id: 'aba_ant', label: 'Aba anterior', k: 'Alt+[', cat: 'Janela', run: () => trocaAba(-1) },
  { id: 'aba_prox', label: 'Próxima aba', k: 'Alt+]', cat: 'Janela', run: () => trocaAba(1) },
  { id: 'paleta', label: 'Paleta de comandos', k: 'Ctrl+K', icone: 'search', cat: 'Exibir', run: () => abrePaleta() },
  { id: 'sidebar', label: 'Barra lateral', k: 'Ctrl+B', icone: 'panel', cat: 'Exibir', run: () => alternaSidebar(), marcado: () => !document.body.classList.contains('sb-off') },
  { id: 'guia', label: 'Painel Guia', k: 'Ctrl+J', icone: 'help', cat: 'Exibir', run: () => alternaGuia(), marcado: () => guiaAberto() },
  { id: 'tema_claro', label: 'Tema claro', cat: 'Exibir', run: () => defineTema('light'), marcado: () => store.get('tema', 'auto') === 'light' },
  { id: 'tema_escuro', label: 'Tema escuro', cat: 'Exibir', run: () => defineTema('dark'), marcado: () => store.get('tema', 'auto') === 'dark' },
  { id: 'tema_auto', label: 'Tema do sistema', cat: 'Exibir', run: () => defineTema('auto'), marcado: () => store.get('tema', 'auto') === 'auto' },
  { id: 'zoom_mais', label: 'Aumentar texto', k: 'Alt+=', cat: 'Exibir', run: () => defineZoom(store.get('zoom', 1) + 0.1) },
  { id: 'zoom_menos', label: 'Diminuir texto', k: 'Alt+-', cat: 'Exibir', run: () => defineZoom(store.get('zoom', 1) - 0.1) },
  { id: 'zoom_zero', label: 'Tamanho padrão do texto', k: 'Alt+0', cat: 'Exibir', run: () => defineZoom(1) },
  { id: 'tela_cheia', label: 'Tela cheia', cat: 'Exibir', run: () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()) },
  { id: 'executar', label: 'Executar o prompt', k: 'Ctrl+Enter', icone: 'play', cat: 'Executar', run: () => roda('executar'), ok: () => temAcao('executar') },
  { id: 'ver_prompt', label: 'Ver o prompt pronto', k: 'Alt+P', icone: 'eye', cat: 'Executar', run: () => roda('verPrompt'), ok: () => temAcao('verPrompt') },
  { id: 'copiar_prompt', label: 'Copiar o prompt pronto', k: 'Alt+C', icone: 'copy', cat: 'Executar', run: () => roda('copiarPrompt'), ok: () => temAcao('copiarPrompt') },
  { id: 'exemplo', label: 'Carregar o exemplo do livro', k: 'Alt+X', icone: 'book', cat: 'Executar', run: () => roda('exemplo'), ok: () => temAcao('exemplo') },
  { id: 'limpar', label: 'Limpar o formulário', cat: 'Executar', run: () => roda('limpar'), ok: () => temAcao('limpar') },
  { id: 'validar', label: 'Validar a execução (validação humana)', k: 'Alt+V', icone: 'clip', cat: 'Executar', run: () => roda('validar'), ok: () => temAcao('validar') },
  { id: 'exp_html', label: 'Exportar documento (HTML para imprimir ou PDF)', k: 'Alt+O', icone: 'download', cat: 'Executar', run: () => roda('exportarHtml'), ok: () => temAcao('exportarHtml') },
  { id: 'exp_md', label: 'Exportar documento (Markdown)', icone: 'download', cat: 'Executar', run: () => roda('exportarMd'), ok: () => temAcao('exportarMd') },
  { id: 'exp_aud', label: 'Exportar Registro de Auditoria de IA (JSON)', icone: 'shield', cat: 'Executar', run: () => roda('exportarAuditoria'), ok: () => temAcao('exportarAuditoria') },
  { id: 'resgatar', label: 'Resgatar código do livro (nível Leitor)', icone: 'book', cat: 'Conta', run: () => go.abrirPlano('codigo') },
  { id: 'byok', label: 'Chave própria de IA (BYOK)', icone: 'key', cat: 'Conta', run: () => go.abrirPlano('byok') },
  { id: 'sair', label: 'Sair', icone: 'logout', cat: 'Conta', run: () => sair() },
  { id: 'ajuda', label: 'Guia rápido', k: 'F1', icone: 'help', cat: 'Ajuda', run: () => go.abrirAjuda() },
  { id: 'atalhos', label: 'Atalhos de teclado', k: 'Ctrl+/', icone: 'help', cat: 'Ajuda', run: () => mostraAtalhos(COMANDOS) },
  { id: 'tour', label: 'Tour de boas-vindas', icone: 'compass', cat: 'Ajuda', run: () => iniciaTour(true) },
  { id: 'sobre', label: 'Sobre o IA PM e o livro', icone: 'book', cat: 'Ajuda', run: () => mostraSobre() },
  { id: 'avisos', label: 'Avisos legais e limites de uso', icone: 'alert', cat: 'Ajuda', run: () => mostraAvisos() },
];
const cmd = (id) => COMANDOS.find((c) => c.id === id);
const rodaCmd = (id) => { const c = cmd(id); if (c && (!c.ok || c.ok())) c.run(); };

// ---------------------------------------------------------------- teclado
function parseCombo(k) {
  const partes = k.split('+'); const tecla = partes.pop() || '+';
  const mapa = { Enter: 'Enter', F1: 'F1', '[': 'BracketLeft', ']': 'BracketRight', ',': 'Comma', '=': 'Equal', '-': 'Minus', '/': 'Slash', '0': 'Digit0' };
  const code = mapa[tecla] || (tecla.length === 1 ? 'Key' + tecla.toUpperCase() : tecla);
  return { ctrl: partes.includes('Ctrl'), alt: partes.includes('Alt'), shift: partes.includes('Shift'), code };
}
const COMBOS = COMANDOS.filter((c) => c.k).map((c) => ({ ...parseCombo(c.k), id: c.id }));
function aoTeclar(e) {
  if (e.isComposing) return;
  const ctrl = e.ctrlKey || e.metaKey;
  const digitoAlt = e.altKey && !ctrl && /^Digit[1-9]$/.test(e.code);
  if (digitoAlt) { e.preventDefault(); abaN(Number(e.code.slice(5))); return; }
  for (const c of COMBOS) {
    if (c.code === e.code && c.ctrl === ctrl && c.alt === e.altKey && c.shift === e.shiftKey) {
      e.preventDefault(); rodaCmd(c.id); return;
    }
  }
  const alvo = e.target;
  const digitando = alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT' || alvo.isContentEditable);
  if (e.key === '?' && !digitando && !ctrl && !e.altKey) { e.preventDefault(); rodaCmd('atalhos'); }
}

// ---------------------------------------------------------------- aparência
function defineTema(t) {
  store.set('tema', t);
  if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
}
function defineZoom(z) {
  z = Math.min(1.4, Math.max(0.85, Math.round(z * 100) / 100)); store.set('zoom', z);
  document.documentElement.style.setProperty('--zoom', z);
}
const alternaSidebar = () => { document.body.classList.toggle('sb-off'); store.set('sb_off', document.body.classList.contains('sb-off')); };
const guiaAberto = () => !document.body.classList.contains('guia-off');
function alternaGuia() { document.body.classList.toggle('guide-off'); document.body.classList.toggle('guide-on'); store.set('guia_off', document.body.classList.contains('guide-off')); desenhaGuia(); }

// ---------------------------------------------------------------- paleta
function abrePaleta() {
  paleta(() => {
    const itens = COMANDOS.filter((c) => (!c.visivel || c.visivel()) && (!c.ok || c.ok())).map((c) => ({ label: c.label, k: c.k, icon: c.icone, cat: c.cat, run: c.run }));
    for (const p of S.prompts) {
      itens.push({ label: p.titulo, cat: `Prompt: ${rotulo(p.setor, p.fase)}`, icon: p.acesso ? 'sparkles' : 'lock', busca: `${p.resumo} ${p.decisao_apoiada}`, run: () => go.abrirPrompt(p.id) });
    }
    for (const s of S.cat.taxonomia.setores) itens.push({ label: `Catálogo: ${s.nome}`, cat: 'Setor', icon: 'library', busca: s.vocabulario.join(' '), run: () => go.abrirCatalogo({ setor: s.id }) });
    for (const f of S.cat.taxonomia.fases) itens.push({ label: `Catálogo: fase ${f.nome}`, cat: 'Fase', icon: 'library', busca: f.descricao, run: () => go.abrirCatalogo({ fase: f.id }) });
    return itens;
  });
}
const rotulo = (s, f) => `${S.cat.taxonomia.setores.find((x) => x.id === s)?.curto} / ${S.cat.taxonomia.fases.find((x) => x.id === f)?.nome}`;

// ---------------------------------------------------------------- guia contextual (painel direito)
const GUIAS_PADRAO = {
  inicio: { titulo: 'Início', intro: 'Este é o seu painel. Daqui você começa uma análise, acompanha o plano e retoma o que já fez.', dicas: ['Não sabe por onde começar? Use a análise guiada.', 'O catálogo mostra todas as combinações de setor e fase.'] },
  catalogo: { titulo: 'Catálogo', intro: 'Cada célula da matriz é uma combinação de setor e fase. Os números mostram quantos prompts existem.', dicas: ['Clique em uma célula para filtrar.', 'Célula vazia? Peça aquele prompt: ele vira prioridade do catálogo.'] },
  execucoes: { titulo: 'Execuções', intro: 'Aqui ficam todas as análises, com status e validação humana.', dicas: ['Execuções sem validação ainda são apenas rascunhos.'] },
  servicos: { titulo: 'Serviços', intro: 'Além da plataforma, oferecemos PMO e consultoria. Solicite uma proposta sem compromisso.', dicas: [] },
  plano: { titulo: 'Plano e uso', intro: 'Veja o que o seu plano inclui, o saldo de créditos e como usar a sua própria chave de IA.', dicas: ['Comprou o livro? Resgate o código para liberar o nível Leitor.', 'Com chave própria (BYOK), o custo da IA vai direto para a sua conta no provedor.'] },
  api: { titulo: 'API', intro: 'Execute os prompts por API. Crie uma chave e use os exemplos abaixo.', dicas: ['Guarde a chave com cuidado: ela é exibida uma única vez.'] },
  config: { titulo: 'Configurações', intro: 'Perfil, equipe, política de dados e aparência.', dicas: [] },
  admin: { titulo: 'Administração', intro: 'Área da equipe da plataforma: códigos do livro, solicitações e usuários.', dicas: [] },
  ajuda: { titulo: 'Guia rápido', intro: 'Conceitos essenciais do portal em poucas linhas.', dicas: [] },
};
function desenhaGuia() {
  const alvo = $('#guide .g-body'); if (!alvo) return;
  const a = abaAtiva();
  const g = a ? (a.inst.guia ? a.inst.guia() : GUIAS_PADRAO[a.tab.tipo]) : { titulo: 'Bem-vindo', intro: 'Abra uma tela pelo menu à esquerda ou use Ctrl+K.', dicas: [] };
  mount(alvo, h('h3', { text: g?.titulo || 'Guia' }), h('p', { class: 'muted sp8', text: g?.intro || '' }),
    ...(g?.passos || []).map((p, i) => h('div', { class: 'g-step ' + (p.estado || '') }, h('span', { class: 'n' }, p.estado === 'done' ? icon('check') : String(i + 1)), h('div', { class: 'tx' }, h('b', { text: p.t }), h('span', { text: p.d })))),
    (g?.acoes || []).length ? h('div', { class: 'stack sp12' }, (g.acoes).map((x) => h('button', { class: 'btn' + (x.primario ? ' primary' : ''), type: 'button', onclick: x.run, text: x.rotulo }))) : null,
    (g?.dicas || []).length ? h('div', { class: 'sp16' }, h('b', { text: 'Dicas' }), h('ul', null, g.dicas.map((d) => h('li', { text: d })))) : null,
    h('div', { class: 'sp16 faint', text: 'Dica: pressione Ctrl+K para buscar qualquer comando ou prompt.' }));
}
on('tab:ativa', () => { desenhaGuia(); atualizaToolbar(); atualizaTitulo(); });
on('guia:atualizar', () => { desenhaGuia(); atualizaToolbar(); });

// ---------------------------------------------------------------- barra de ferramentas e status
function atualizaToolbar() {
  ferramentasToolbar().forEach((b) => { const c = cmd(b.dataset.cmd); b.disabled = !!(c && c.ok && !c.ok()); });
}
const ferramentasToolbar = () => [...document.querySelectorAll('#toolbar [data-cmd]')];
function ferramenta(id, rotuloTxt, ic, extra = '') {
  const c = cmd(id);
  return h('button', { class: 'tool ' + extra, type: 'button', dataset: { cmd: id }, title: `${c.label}${c.k ? ' (' + c.k + ')' : ''}`, onclick: () => rodaCmd(id) }, icon(ic), rotuloTxt);
}
function desenhaToolbar() {
  const tb = $('#toolbar');
  mount(tb, ferramenta('nova', 'Nova análise', 'compass'), ferramenta('catalogo', 'Catálogo', 'library'), h('span', { class: 'tool-sep' }),
    ferramenta('executar', 'Executar', 'play', 'primary'), ferramenta('ver_prompt', 'Ver prompt', 'eye'), ferramenta('copiar_prompt', 'Copiar prompt', 'copy'), ferramenta('exemplo', 'Exemplo do livro', 'book'),
    h('span', { class: 'tool-sep' }), ferramenta('validar', 'Validar', 'clip'),
    h('button', { class: 'tool', type: 'button', dataset: { cmd: 'exp_html' }, title: 'Exportar', onclick: (e) => abreMenu(e.currentTarget, ['exp_html', 'exp_md', 'exp_aud'].map((i) => ({ label: cmd(i).label, k: cmd(i).k, enabled: cmd(i).ok, run: cmd(i).run }))) }, icon('download'), 'Exportar', icon('chevd')),
    h('span', { class: 'tool-sp' }), ferramenta('guia', 'Guia', 'help'));
  atualizaToolbar();
}
function atualizaTitulo() {
  const a = abaAtiva();
  const t = $('#titlebar .ctx'); if (t) mount(t, `${S.eu.organizacao.nome}${a ? '  ·  ' + a.tab.titulo : ''}`);
  document.title = a ? `${a.tab.titulo} - IA PM` : 'IA PM';
}
function desenhaStatus() {
  const eu = S.eu; const sb = $('#statusbar'); if (!sb) return;
  const d = diasAte(eu.plano.valido_ate);
  const ia = eu.ambiente.creditos_gerenciados ? 'IA gerenciada ativa' : 'IA gerenciada indisponível';
  mount(sb,
    h('span', { class: 'sb-item static' }, icon('bolt'), `Plano ${eu.plano.nome}${eu.plano.valido_ate ? ` (${d} dia(s))` : ''}`),
    h('button', { class: 'sb-item', type: 'button', title: 'Saldo de créditos', onclick: () => go.abrirPlano('creditos') }, icon('card'), `${fmtNum(eu.creditos)} créditos`),
    h('button', { class: 'sb-item', type: 'button', title: 'Chave própria', onclick: () => go.abrirPlano('byok') }, icon('key'), eu.byok.configurado ? `BYOK ••••${eu.byok.final}` : 'Sem chave própria'),
    h('span', { class: 'sb-item static', title: ia }, icon('sparkles'), ia),
    eu.ambiente.cobranca === 'demo' ? h('span', { class: 'sb-item static', title: 'Contratação e compra de créditos funcionam em modo de demonstração, sem cobrança real.' }, icon('info'), 'Cobrança em demonstração') : null,
    h('span', { class: 'sp' }),
    h('button', { class: 'sb-item', type: 'button', onclick: () => rodaCmd('paleta') }, icon('search'), 'Ctrl+K comandos'),
    h('button', { class: 'sb-item', type: 'button', onclick: () => rodaCmd('ajuda') }, icon('help'), 'F1 ajuda'),
    h('span', { class: 'sb-item static', text: 'v1.0' }));
}
on('eu:mudou', () => { desenhaStatus(); atualizaTitulo(); });
on('eu:recarregar', () => { recarregaEu().catch(() => {}); });
on('cmd', (id) => rodaCmd(id));

export async function recarregaEu() { S.eu = await api('/v1/auth/eu'); await recarregaPrompts().catch(() => {}); emit('eu:mudou'); return S.eu; }
export async function recarregaPrompts() { S.prompts = (await api('/v1/prompts')).prompts; }

// ---------------------------------------------------------------- atividades e barra lateral
function desenhaAtividades() {
  const box = $('#activity'); clear(box);
  for (const a of ATIVIDADES) {
    box.append(h('button', { class: 'act' + (S.sidebar === a.id ? ' on' : ''), type: 'button', title: a.dica, 'aria-label': a.titulo, dataset: { act: a.id },
      onclick: () => { if (S.sidebar === a.id && !document.body.classList.contains('sb-off') && abaAtiva()?.tab.tipo === a.id) { alternaSidebar(); return; } if (document.body.classList.contains('sb-off')) alternaSidebar(); selecionaAtividade(a.id); ABRIR[a.id]?.(); } }, icon(a.icone)));
  }
  box.append(h('span', { class: 'sp' }));
  if (S.eu.usuario.is_staff) box.append(h('button', { class: 'act', type: 'button', title: 'Administração', 'aria-label': 'Administração', onclick: () => go.abrirAdmin() }, icon('shield')));
  box.append(h('button', { class: 'act', type: 'button', title: 'Configurações (Alt+,)', 'aria-label': 'Configurações', onclick: () => go.abrirConfig() }, icon('gear')),
    h('button', { class: 'act', type: 'button', title: 'Ajuda (F1)', 'aria-label': 'Ajuda', onclick: () => go.abrirAjuda() }, icon('help')));
}
const ABRIR = { inicio: () => go.abrirInicio(), assistente: () => go.abrirAssistente(), catalogo: () => go.abrirCatalogo(), execucoes: () => go.abrirExecucoes(), servicos: () => go.abrirServicos(), plano: () => go.abrirPlano(), api: () => go.abrirApi() };
function selecionaAtividade(id) {
  S.sidebar = id; store.set('atividade', id);
  document.querySelectorAll('#activity .act[data-act]').forEach((b) => b.classList.toggle('on', b.dataset.act === id));
  renderSidebar(id, $('#sidebar .sb-head'), $('#sidebar .sb-body'));
}

function menus() {
  const it = (id) => ({ label: cmd(id).label, k: cmd(id).k, icon: cmd(id).icone, enabled: cmd(id).ok, checked: cmd(id).marcado, run: cmd(id).run });
  const sep = { sep: true };
  return [
    { titulo: 'Arquivo', itens: () => [it('nova'), it('catalogo'), sep, it('fechar'), it('fechar_todas'), sep, { label: 'Instalar como aplicativo...', icon: 'download', enabled: () => !!window.__iapmInstalar, run: () => window.__iapmInstalar && window.__iapmInstalar() }, sep, it('sair')] },
    { titulo: 'Editar', itens: () => [it('exemplo'), it('limpar'), sep, it('copiar_prompt'), it('ver_prompt')] },
    { titulo: 'Exibir', itens: () => [it('inicio'), it('execucoes'), sep, it('sidebar'), it('guia'), sep, it('tema_claro'), it('tema_escuro'), it('tema_auto'), sep, it('zoom_mais'), it('zoom_menos'), it('zoom_zero'), it('tela_cheia')] },
    { titulo: 'Catálogo', itens: () => [it('catalogo'), it('nova'), sep, ...S.cat.taxonomia.setores.map((s) => ({ label: s.nome, icon: 'library', run: () => go.abrirCatalogo({ setor: s.id }) }))] },
    { titulo: 'Executar', itens: () => [it('executar'), it('ver_prompt'), sep, it('validar'), sep, it('exp_html'), it('exp_md'), it('exp_aud')] },
    { titulo: 'Conta', itens: () => [it('plano'), it('resgatar'), it('byok'), it('api'), it('servicos'), sep, it('config')] },
    { titulo: 'Ajuda', itens: () => [it('ajuda'), it('atalhos'), it('tour'), sep, it('sobre'), it('avisos')] },
  ];
}

function iniciaTour(forcado = false) {
  const passos = [
    { titulo: 'Bem-vindo ao IA PM', texto: 'Em 1 minuto você conhece o portal. Ele funciona como um aplicativo de desktop: menus, abas, atalhos e um guia sempre à mão.' },
    { sel: '#activity', titulo: 'Barra de atividades', texto: 'Alterne entre Início, Análise guiada, Catálogo, Execuções, Serviços, Plano e API.' },
    { sel: '#sidebar', titulo: 'Barra lateral', texto: 'Mostra o conteúdo da atividade escolhida. No catálogo, é a árvore de setores, fases e prompts.' },
    { sel: '#tabstrip', titulo: 'Abas', texto: 'Cada análise abre em uma aba. Você pode ter várias abertas e voltar a elas depois.' },
    { sel: '#guide', titulo: 'Painel Guia', texto: 'Explica a tela atual e indica o próximo passo. Alterne com Ctrl+J.' },
    { sel: '#titlebar .search', titulo: 'Paleta de comandos', texto: 'Pressione Ctrl+K e digite o que procura: um prompt, um setor ou um comando.' },
    { sel: '#toolbar', titulo: 'Barra de ferramentas', texto: 'Executar, copiar o prompt, carregar o exemplo do livro, validar e exportar. Os botões ficam ativos quando se aplicam.' },
    { titulo: 'Pronto para começar', texto: 'Clique em "Nova análise" e siga o passo a passo. Os números são calculados por código e todo resultado exige validação humana.' },
  ];
  tour(passos, async () => { if (!S.eu.usuario.onboarding_ok) { try { await api('/v1/auth/onboarding', { method: 'POST' }); S.eu.usuario.onboarding_ok = true; } catch { /* segue */ } } });
}

// ---------------------------------------------------------------- construção do shell
function constroiShell() {
  const eu = S.eu;
  const app = h('div', { id: 'app' },
    h('header', { id: 'titlebar' },
      h('div', { class: 'logo' }, h('span', { class: 'logo-mark', text: 'IA' }), h('span', null, 'IA ', h('b', { text: 'PM' }))),
      h('div', { class: 'ctx' }),
      h('div', { class: 'search', role: 'button', tabindex: '0', onclick: () => rodaCmd('paleta') }, icon('search'), h('span', { text: 'Buscar prompts e comandos' }), h('kbd', { text: 'Ctrl+K' })),
      h('button', { class: 'tb-btn', type: 'button', title: 'Alternar tema', 'aria-label': 'Alternar tema', onclick: () => defineTema(document.documentElement.getAttribute('data-theme') === 'dark' || (!document.documentElement.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches) ? 'light' : 'dark') }, icon('moon')),
      h('button', { class: 'avatar', type: 'button', title: `${eu.usuario.nome} (${eu.usuario.email})`, 'aria-label': 'Menu da conta', text: iniciais(eu.usuario.nome),
        onclick: (e) => abreMenu(e.currentTarget, [{ label: eu.usuario.nome, enabled: () => false }, { label: eu.usuario.email, enabled: () => false }, { sep: true }, { label: 'Plano e uso', icon: 'card', run: cmd('plano').run }, { label: 'Configurações', icon: 'gear', run: cmd('config').run }, { sep: true }, { label: 'Sair', icon: 'logout', run: sair }], { alinhar: 'right' }) })),
    h('nav', { id: 'menubar', 'aria-label': 'Menu principal' }),
    h('div', { id: 'toolbar', role: 'toolbar', 'aria-label': 'Ferramentas' }),
    h('div', { id: 'workspace' },
      h('div', { id: 'activity', role: 'tablist', 'aria-orientation': 'vertical', 'aria-label': 'Atividades' }),
      h('aside', { id: 'sidebar' }, h('div', { class: 'sb-head' }), h('div', { class: 'sb-body' })),
      h('div', { id: 'resizer', role: 'separator', 'aria-orientation': 'vertical', 'aria-label': 'Redimensionar barra lateral' }),
      h('main', { id: 'main' }, h('div', { id: 'tabstrip', role: 'tablist' }), h('div', { id: 'panels' })),
      h('aside', { id: 'guide', 'aria-label': 'Guia' }, h('div', { class: 'g-head' }, icon('help'), 'Guia'), h('div', { class: 'g-body' }))),
    h('footer', { id: 'statusbar' }));
  document.body.append(app);
  iniciaNav($('#tabstrip'), $('#panels'));
  menuBar($('#menubar'), menus());
  desenhaToolbar(); desenhaAtividades(); desenhaStatus(); atualizaTitulo();
  // largura da barra lateral
  const larg = store.get('sb_w', 280); document.documentElement.style.setProperty('--sb-w', larg + 'px');
  const rs = $('#resizer');
  rs.addEventListener('mousedown', (e) => {
    e.preventDefault(); rs.classList.add('drag');
    const mv = (ev) => { const w = Math.min(520, Math.max(200, ev.clientX - 48)); document.documentElement.style.setProperty('--sb-w', w + 'px'); store.set('sb_w', w); };
    const up = () => { rs.classList.remove('drag'); document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  });
  if (store.get('sb_off', window.innerWidth < 1000)) document.body.classList.add('sb-off');
  if (store.get('guia_off', window.innerWidth < 1100)) document.body.classList.add('guide-off'); else document.body.classList.add('guide-on');
  selecionaAtividade(store.get('atividade', 'catalogo'));
  desenhaGuia();
}

async function sair() {
  try { await api('/v1/auth/sair', { method: 'POST' }); } catch { /* segue */ }
  location.reload();
}

async function iniciaApp(eu) {
  S.eu = eu;
  await recarregaPrompts();
  constroiShell();
  if (!restaura()) go.abrirInicio();
  if (!eu.usuario.onboarding_ok) setTimeout(() => iniciaTour(), 500);
}

// ---------------------------------------------------------------- boot
async function boot() {
  const tema = store.get('tema', 'auto'); if (tema !== 'auto') defineTema(tema);
  defineZoom(store.get('zoom', 1));
  document.addEventListener('keydown', aoTeclar);
  on('auth:expirou', () => { if (S.eu && !document.getElementById('login')) { toast('Sua sessão expirou. Entre novamente.', 'warn'); setTimeout(() => location.reload(), 1200); } });
  try { S.cat = await api('/v1/catalogo'); } catch { document.body.append(h('div', { class: 'empty', text: 'Não foi possível carregar o IA PM. Tente recarregar a página.' })); return; }
  let eu = null;
  try { const r = await api('/v1/auth/sessao'); if (r.autenticado) eu = r; } catch { /* servidor indisponível: mostra o login */ }
  if (eu) await iniciaApp(eu); else mostraLogin((e) => iniciaApp(e));
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); window.__iapmInstalar = () => { e.prompt(); window.__iapmInstalar = null; }; });
}
boot();
