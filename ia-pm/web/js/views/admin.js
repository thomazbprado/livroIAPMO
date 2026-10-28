import { h, api, S, mount, icon, fmtData, fmtNum, baixar, copiar } from '../core.js';
import { toast } from '../ui.js';

export default function admin(tab, el) {
  const raiz = h('div', { class: 'wrap stack' }); el.append(raiz);
  let aba = 'resumo'; let dados = {}; let ultimo = null; const cfgCod = { quantidade: 10, dias: 180, lote: '', validade: '' };
  async function carrega() {
    try {
      dados.resumo = await api('/v1/admin/resumo');
      if (aba === 'leads') dados.leads = (await api('/v1/admin/leads')).leads;
      if (aba === 'usuarios') dados.usuarios = (await api('/v1/admin/usuarios')).usuarios;
    } catch (e) { mount(raiz, h('div', { class: 'callout bad' }, icon('alert'), e.message)); return; }
    desenha();
  }
  function resumo() {
    const r = dados.resumo;
    return h('div', { class: 'grid g4' }, [['Organizações', r.organizacoes], ['Usuários', r.usuarios], ['Execuções (30 dias)', r.execucoes_30d], ['Custo no provedor, 30 dias (US$)', fmtNum(r.custo_usd_30d, 2)], ['Créditos consumidos (30 dias)', fmtNum(r.creditos_consumidos_30d)], ['Solicitações e pedidos', r.leads], ['Códigos do livro gerados', r.codigos_total], ['Códigos resgatados', r.codigos_usados]]
      .map(([l, v]) => h('div', { class: 'card kpi' }, h('span', { class: 'v', text: v }), h('span', { class: 'l', text: l }))));
  }
  function codigos() {
    const f = cfgCod; const area = h('div');
    const campo = (k, rot, tipo = 'number') => { const i = h('input', { class: 'inp', type: tipo, oninput: (e) => { f[k] = e.target.value; } }); i.value = f[k]; return h('div', { class: 'field' }, h('label', { text: rot }), i); };
    const mostra = () => {
      if (!ultimo) return;
      const ta = h('textarea', { class: 'inp mono sp8', rows: 8, readonly: true }); ta.value = ultimo.codigos.join('\n');
      mount(area, h('div', { class: 'callout warn' }, icon('alert'), 'Guarde estes códigos agora. Por segurança, eles não podem ser consultados depois (o sistema guarda apenas o hash).'), ta,
        h('div', { class: 'row sp8' }, h('button', { class: 'btn', type: 'button', onclick: () => baixar(ultimo.csv, `codigos-leitor-${ultimo.lote || 'lote'}.csv`, 'text/csv'), text: 'Baixar CSV' }),
          h('button', { class: 'btn', type: 'button', onclick: async () => toast((await copiar(ultimo.codigos.join('\n'))) ? 'Copiado.' : 'Falha ao copiar.', 'ok'), text: 'Copiar' })));
    };
    const gera = async () => {
      try {
        const corpo = { quantidade: Number(f.quantidade), dias: Number(f.dias), lote: f.lote }; if (f.validade) corpo.validade_dias = Number(f.validade);
        ultimo = await api('/v1/admin/codigos', { method: 'POST', body: corpo });
        mostra(); toast(`${ultimo.quantidade} código(s) gerado(s).`, 'ok');
        dados.resumo = await api('/v1/admin/resumo');
      } catch (e) { toast(e.message, 'bad'); }
    };
    mostra();
    return h('div', { class: 'card stack' }, h('h3', { text: 'Gerar códigos do livro (nível Leitor)' }), h('p', { class: 'muted', text: 'Cada código vale para uma organização e libera o nível Leitor pelo número de dias escolhido. Imprima um por exemplar.' }),
      h('div', { class: 'grid g4' }, campo('quantidade', 'Quantidade'), campo('dias', 'Dias de acesso'), campo('lote', 'Lote (ex.: 1ª edição)', 'text'), campo('validade', 'Validade do código, em dias (opcional)')),
      h('div', null, h('button', { class: 'btn primary', type: 'button', onclick: gera }, icon('plus'), 'Gerar códigos')), area);
  }
  function leads() {
    const l = dados.leads || [];
    return l.length ? h('div', { class: 'tscroll' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, ['Quando', 'Tipo', 'Nome', 'E-mail', 'Empresa', 'Assunto', 'Mensagem'].map((c) => h('th', { text: c })))),
      h('tbody', null, l.map((x) => h('tr', null, h('td', { text: fmtData(x.criado_em) }), h('td', null, h('span', { class: 'chip', text: x.tipo })), h('td', { text: x.nome }), h('td', { text: x.email }), h('td', { text: x.empresa }), h('td', { text: x.servico_id }), h('td', { text: x.mensagem })))))) : h('div', { class: 'empty', text: 'Nenhuma solicitação ainda.' });
  }
  function usuarios() {
    const u = dados.usuarios || [];
    return h('div', { class: 'tscroll' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, ['Nome', 'E-mail', 'Organização', 'Plano', 'Origem', 'Créditos', 'Criado em'].map((c) => h('th', { text: c })))),
      h('tbody', null, u.map((x) => h('tr', null, h('td', { text: x.nome }), h('td', { text: x.email }), h('td', null, x.org, h('div', { class: 'faint mono', text: x.org_id })), h('td', null, h('span', { class: 'chip', text: x.plano })), h('td', { text: x.plano_origem }), h('td', { class: 'num', text: fmtNum(x.creditos) }), h('td', { text: fmtData(x.criado_em, false) }))))));
  }
  function desenha() {
    const abas = [['resumo', 'Resumo'], ['codigos', 'Códigos do livro'], ['leads', 'Solicitações'], ['usuarios', 'Usuários']];
    mount(raiz, h('div', null, h('h1', { text: 'Administração da plataforma' }), h('p', { class: 'muted', text: 'Área da equipe: códigos do livro, solicitações comerciais e usuários.' })),
      h('div', { class: 'subtabs' }, abas.map(([id, rot]) => h('button', { class: 'subtab' + (aba === id ? ' on' : ''), type: 'button', onclick: () => { aba = id; carrega(); }, text: rot }))),
      aba === 'resumo' ? resumo() : aba === 'codigos' ? codigos() : aba === 'leads' ? leads() : usuarios());
  }
  carrega();
  return { aoAtivar: carrega };
}
