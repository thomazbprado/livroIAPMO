import { h, api, S, store, mount, icon, emit, on, fmtData, copiar } from '../core.js';
import { toast, modal, confirmar } from '../ui.js';

export default function config(tab, el) {
  const raiz = h('div', { class: 'wrap stack' }); el.append(raiz);
  let membros = null;
  const admin = () => S.eu.usuario.papel === 'admin';

  async function carrega() { try { membros = await api('/v1/org/membros'); } catch { membros = null; } desenha(); }

  function perfil() {
    const f = { atual: '', nova: '', conf: '' };
    const inp = (k, rot) => h('div', { class: 'field' }, h('label', { text: rot }), h('input', { class: 'inp', type: 'password', autocomplete: k === 'atual' ? 'current-password' : 'new-password', oninput: (e) => { f[k] = e.target.value; } }));
    return h('section', { class: 'card stack' }, h('h2', { text: 'Perfil' }),
      h('div', { class: 'grid g2' }, h('div', { class: 'field' }, h('label', { text: 'Nome' }), h('input', { class: 'inp', value: S.eu.usuario.nome, readonly: true })), h('div', { class: 'field' }, h('label', { text: 'E-mail' }), h('input', { class: 'inp', value: S.eu.usuario.email, readonly: true }))),
      h('h3', { text: 'Trocar senha' }), h('div', { class: 'grid g3' }, inp('atual', 'Senha atual'), inp('nova', 'Nova senha'), inp('conf', 'Confirmar nova senha')),
      h('div', null, h('button', { class: 'btn', type: 'button', onclick: async () => {
        if (f.nova !== f.conf) { toast('A confirmação não confere com a nova senha.', 'warn'); return; }
        try { await api('/v1/auth/senha', { method: 'PUT', body: { senha_atual: f.atual, senha_nova: f.nova } }); toast('Senha alterada.', 'ok'); } catch (e) { toast(e.message, 'bad'); }
      } }, 'Alterar senha')));
  }
  function convidar() {
    const f = { email: '', papel: 'membro' };
    modal({ titulo: 'Convidar para a organização', corpo: h('div', { class: 'stack' }, h('p', { class: 'muted', text: 'Gere um código de convite e envie à pessoa. Ela o informa ao criar a conta, usando o mesmo e-mail.' }),
      h('div', { class: 'field' }, h('label', { text: 'E-mail da pessoa' }), h('input', { class: 'inp', type: 'email', oninput: (e) => { f.email = e.target.value; } })),
      h('div', { class: 'field' }, h('label', { text: 'Papel' }), h('select', { class: 'inp', onchange: (e) => { f.papel = e.target.value; } }, h('option', { value: 'membro', text: 'Membro (executa e valida as próprias análises)' }), h('option', { value: 'admin', text: 'Administrador (equipe, plano, chaves e política)' })))),
      botoes: [{ label: 'Cancelar' }, { label: 'Gerar convite', primary: true, onclick: async () => {
        try {
          const r = await api('/v1/org/convites', { method: 'POST', body: f });
          modal({ titulo: 'Convite gerado', corpo: h('div', { class: 'stack' }, h('p', { text: `Envie este código para ${r.email}. Vale por ${r.expira_em_dias} dias.` }), h('input', { class: 'inp mono', readonly: true, value: r.convite, onfocus: (e) => e.target.select(), 'aria-label': 'Código de convite' }), h('p', { class: 'faint', text: r.instrucao })),
            botoes: [{ label: 'Copiar código', primary: true, onclick: async () => { await copiar(r.convite); toast('Código copiado.', 'ok'); } }] });
          carrega();
        } catch (e) { toast(e.message, 'bad'); return false; }
      } }] });
  }
  function organizacao() {
    const e = S.eu;
    return h('section', { class: 'card stack' }, h('h2', { text: 'Organização' }),
      h('div', { class: 'row sb' }, h('div', null, h('b', { text: e.organizacao.nome }), h('div', { class: 'faint', text: e.organizacao.tipo === 'empresa' ? 'Empresa ou consultoria' : 'Conta individual' })),
        membros ? h('span', { class: 'chip', text: `${membros.assentos.usados} de ${membros.assentos.total} usuário(s)` }) : null),
      membros ? h('div', { class: 'tscroll' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', { text: 'Nome' }), h('th', { text: 'E-mail' }), h('th', { text: 'Papel' }), h('th', { text: 'Último acesso' }), h('th'))),
        h('tbody', null, membros.membros.filter((m) => m.ativo).map((m) => h('tr', null, h('td', { text: m.nome }), h('td', { text: m.email }), h('td', null, h('span', { class: 'chip', text: m.papel === 'admin' ? 'Administrador' : 'Membro' })), h('td', { text: m.ultimo_login ? fmtData(m.ultimo_login) : 'nunca' }),
          h('td', null, admin() && m.email !== e.usuario.email ? h('button', { class: 'btn sm danger', type: 'button', onclick: async () => { if (await confirmar('Desativar usuário', `${m.nome} perderá o acesso à organização.`, 'Desativar', true)) { try { await api('/v1/org/membros/' + m.id, { method: 'DELETE' }); carrega(); } catch (er) { toast(er.message, 'bad'); } } }, text: 'Desativar' }) : null)))))) : null,
      membros && membros.convites.length ? h('div', null, h('b', { text: 'Convites pendentes' }), h('ul', null, membros.convites.map((c) => h('li', { text: `${c.email} (${c.papel}), expira em ${fmtData(c.expira_em, false)}` })))) : null,
      admin() ? h('div', null, h('button', { class: 'btn', type: 'button', onclick: convidar }, icon('plus'), 'Convidar pessoa')) : null,
      h('h3', { class: 'sp8', text: 'Política de dados' }),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!e.organizacao.politica.permitir_restrita_byok, disabled: !admin(), onchange: async (ev) => {
        try { await api('/v1/org/politica', { method: 'PUT', body: { permitir_restrita_byok: ev.target.checked } }); toast('Política atualizada.', 'ok'); emit('eu:recarregar'); } catch (er) { toast(er.message, 'bad'); ev.target.checked = !ev.target.checked; }
      } }), h('span', null, h('b', { text: 'Permitir dados restritos com chave própria (BYOK). ' }), 'Por padrão, dados classificados como restritos nunca são enviados à IA. Habilite apenas se o seu contrato com o provedor de IA e a sua política interna permitirem.')));
  }
  function aparencia() {
    const tema = store.get('tema', 'auto');
    const r = (v, rot) => h('label', { class: 'check' }, h('input', { type: 'radio', name: 'tema', checked: tema === v, onchange: () => { emit('cmd', 'tema_' + (v === 'light' ? 'claro' : v === 'dark' ? 'escuro' : 'auto')); } }), h('span', { text: rot }));
    return h('section', { class: 'card stack' }, h('h2', { text: 'Aparência e ajuda' }),
      h('div', { class: 'field' }, h('label', { text: 'Tema' }), r('auto', 'Seguir o sistema'), r('light', 'Claro'), r('dark', 'Escuro')),
      h('div', { class: 'row wrap' }, h('button', { class: 'btn', type: 'button', onclick: () => emit('cmd', 'zoom_menos'), text: 'A−' }), h('button', { class: 'btn', type: 'button', onclick: () => emit('cmd', 'zoom_zero'), text: 'Tamanho padrão' }), h('button', { class: 'btn', type: 'button', onclick: () => emit('cmd', 'zoom_mais'), text: 'A+' })),
      h('div', { class: 'row wrap' }, h('button', { class: 'btn', type: 'button', onclick: () => emit('cmd', 'tour'), text: 'Rever o tour de boas-vindas' }), h('button', { class: 'btn', type: 'button', onclick: () => emit('cmd', 'atalhos'), text: 'Ver atalhos de teclado' })),
      h('p', { class: 'faint', text: 'Dica: no Chrome ou no Edge, use o menu do navegador e escolha "Instalar IA PM" para abrir o portal em uma janela própria, como um aplicativo.' }));
  }
  function privacidade() {
    return h('section', { class: 'card stack' }, h('h2', { text: 'Privacidade e dados' }),
      h('ul', null, h('li', { text: 'Cada execução guarda os dados informados, o prompt enviado e o resultado, para fins de auditoria, pelo prazo de retenção definido para o serviço.' }), h('li', { text: 'A chave própria de IA é guardada cifrada e nunca é exibida de volta.' }), h('li', { text: 'Com créditos ou chave própria, o conteúdo do prompt é enviado ao provedor de IA para gerar a resposta. Não envie dados pessoais sensíveis nem informação classificada como restrita.' }), h('li', { text: 'O uso desta plataforma é regido pelos Termos de Uso e pela Política de Privacidade vigentes.' })));
  }
  function desenha() { mount(raiz, h('div', null, h('h1', { text: 'Configurações' }), h('p', { class: 'muted', text: 'Perfil, equipe, política de dados e aparência.' })), perfil(), organizacao(), aparencia(), privacidade()); }
  carrega(); on('eu:mudou', () => { if (el.isConnected && !el.hidden) carrega(); });
  return { aoAtivar: carrega };
}
