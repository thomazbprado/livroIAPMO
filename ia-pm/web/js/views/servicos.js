import { h, api, S, mount, icon, emit } from '../core.js';
import { toast, modal } from '../ui.js';

const ICONES = { pmo: 'building', ia: 'sparkles', revisao: 'clip', biblioteca: 'library', treinamento: 'user', auditoria: 'shield', api: 'code' };

export default function servicos(tab, el) {
  const raiz = h('div', { class: 'wrap stack' }); el.append(raiz);
  let lista = [];
  function solicitar(s) {
    const campos = { nome: S.eu.usuario.nome, email: S.eu.usuario.email, empresa: S.eu.organizacao.tipo === 'empresa' ? S.eu.organizacao.nome : '', mensagem: '' };
    const inp = (k, rot, tipo = 'text', area = false) => { const c = h(area ? 'textarea' : 'input', { class: 'inp', id: 'sv-' + k, ...(area ? { rows: 4 } : { type: tipo }), oninput: (e) => { campos[k] = e.target.value; } }); c.value = campos[k]; return h('div', { class: 'field' }, h('label', { for: 'sv-' + k, text: rot }), c); };
    modal({ titulo: s ? `Solicitar proposta: ${s.titulo}` : 'Falar com a equipe', corpo: h('div', { class: 'stack' }, h('p', { class: 'muted', text: 'Conte rapidamente o seu contexto. Respondemos pelo e-mail informado, sem compromisso.' }),
      inp('nome', 'Nome'), inp('email', 'E-mail', 'email'), inp('empresa', 'Empresa'), inp('mensagem', 'O que você precisa?', 'text', true)),
      botoes: [{ label: 'Cancelar' }, { label: 'Enviar solicitação', primary: true, onclick: async () => {
        try { await api('/v1/servicos/solicitar', { method: 'POST', body: { ...campos, servico_id: s ? s.id : '' } }); toast('Solicitação enviada. Entraremos em contato.', 'ok'); } catch (e) { toast(e.message, 'bad'); return false; }
      } }] });
  }
  function desenha(sel) {
    mount(raiz, h('div', { class: 'hero' }, h('h1', { text: 'Serviços de PMO e gestão de projetos' }), h('p', { class: 'sp8', text: 'A plataforma entrega prompts e verificação. Quando você precisar de gente experiente ao lado, nós entramos: PMO, revisão independente, treinamento e implantação de IA com governança.' }),
      h('div', { class: 'row sp16' }, h('button', { class: 'btn primary lg', type: 'button', onclick: () => solicitar(null), text: 'Falar com a equipe' }))),
      h('div', { class: 'grid auto' }, lista.map((s) => h('div', { class: 'card stack', id: 'svc-' + s.id, style: sel === s.id ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 3px var(--accent-soft)' } : {} },
        h('div', { class: 'row' }, h('div', { class: 'hero-card' }, h('div', { class: 'ic' }, icon(ICONES[s.icone] || 'briefcase', 'lg'))), h('h3', { text: s.titulo })),
        h('div', { class: 'muted', text: s.resumo }), h('div', null, h('b', { text: 'Para quem: ' }), s.para_quem),
        h('div', null, h('b', { text: 'Entregáveis:' }), h('ul', null, s.entregaveis.map((x) => h('li', { text: x })))),
        h('div', null, h('button', { class: 'btn primary', type: 'button', onclick: () => solicitar(s), text: 'Solicitar proposta' }))))),
      h('div', { class: 'faint', text: 'Os serviços são contratados à parte da assinatura da plataforma, sob proposta.' }));
    if (sel) setTimeout(() => document.getElementById('svc-' + sel)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  }
  api('/v1/servicos').then((d) => { lista = d.servicos; desenha(); }).catch((e) => mount(raiz, h('div', { class: 'callout bad' }, icon('alert'), e.message)));
  return { seleciona: (id) => desenha(id) };
}
