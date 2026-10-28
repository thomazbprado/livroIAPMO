import { h, api, S, mount, icon } from '../core.js';

export function mostraLogin(aoEntrar) {
  const raiz = h('div', { id: 'login' });
  const cob = S.cat?.cobertura || { prompts: 11, celulas: 42, cobertas: 11 };
  let modo = 'entrar';

  const msg = h('div', { class: 'callout bad', role: 'alert', hidden: true });
  const campo = (rotulo, nome, tipo = 'text', extra = {}) => {
    const inp = h('input', { class: 'inp', id: 'f-' + nome, name: nome, type: tipo, ...extra });
    return { inp, el: h('div', { class: 'field' }, h('label', { for: 'f-' + nome, text: rotulo }), inp, extra.help ? h('div', { class: 'help', text: extra.help }) : null) };
  };
  const nome = campo('Seu nome', 'nome', 'text', { autocomplete: 'name' });
  const email = campo('E-mail', 'email', 'email', { autocomplete: 'email', required: true });
  const senha = campo('Senha', 'senha', 'password', { autocomplete: 'current-password', required: true });
  const org = campo('Empresa ou consultoria (opcional)', 'org', 'text', { autocomplete: 'organization' });
  const convite = campo('Código de convite (opcional)', 'convite', 'text', { help: 'Se a sua equipe já usa o IA PM, informe o código recebido.' });
  const enviar = h('button', { class: 'btn primary lg', type: 'submit', style: { width: '100%', justifyContent: 'center' } });
  const alterna = h('button', { class: 'btn ghost', type: 'button', style: { width: '100%' } });
  const titulo = h('h2'); const sub = h('p', { class: 'muted' });
  const form = h('form', { class: 'stack', novalidate: true });

  const desenha = () => {
    const novo = modo === 'criar';
    mount(titulo, novo ? 'Criar conta' : 'Entrar');
    mount(sub, novo ? 'Comece de graça. Você pode liberar todos os prompts do livro depois, com o código impresso.' : 'Bem-vindo de volta ao IA PM.');
    senha.inp.autocomplete = novo ? 'new-password' : 'current-password';
    mount(form, msg, novo ? nome.el : null, email.el, senha.el,
      novo ? h('div', { class: 'help faint', text: 'Use ao menos 10 caracteres, com letras maiúsculas, minúsculas e um número.' }) : null,
      novo ? org.el : null, novo ? convite.el : null, enviar);
    mount(enviar, novo ? 'Criar conta e entrar' : 'Entrar');
    mount(alterna, novo ? 'Já tenho conta. Entrar' : 'Não tenho conta. Criar agora');
    msg.hidden = true;
  };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.hidden = true; enviar.disabled = true;
    try {
      const corpo = modo === 'criar'
        ? { nome: nome.inp.value, email: email.inp.value, senha: senha.inp.value, organizacao: org.inp.value, convite: convite.inp.value }
        : { email: email.inp.value, senha: senha.inp.value };
      const eu = await api(modo === 'criar' ? '/v1/auth/registrar' : '/v1/auth/entrar', { method: 'POST', body: corpo });
      raiz.remove(); aoEntrar(eu);
    } catch (err) {
      mount(msg, icon('alert'), h('div', { text: err.message })); msg.hidden = false; enviar.disabled = false;
    }
  });
  alterna.addEventListener('click', () => { modo = modo === 'criar' ? 'entrar' : 'criar'; desenha(); });

  raiz.append(
    h('div', { class: 'brand' },
      h('div', { class: 'row' }, h('div', { class: 'logo-mark', style: { width: '36px', height: '36px', fontSize: '15px' }, text: 'IA' }), h('b', { style: { fontSize: '1.5em' }, text: 'IA PM' })),
      h('h1', { text: 'Inteligência artificial na gestão de projetos de capital' }),
      h('p', { class: 'tag', text: 'Os prompts do livro, prontos para executar: por setor, por fase e por disciplina, com números verificados por código e registro de auditoria.' }),
      h('ul', null,
        h('li', { text: 'Passo a passo guiado: do seu projeto ao prompt certo.' }),
        h('li', { text: 'Cálculos (EVM, custos, desvios) feitos por código, não pelo modelo.' }),
        h('li', { text: 'Validação humana e Registro de Auditoria de IA em cada execução.' }),
        h('li', { text: 'Use a sua própria chave de IA ou créditos da plataforma, também por API.' })),
      h('div', { class: 'stats' },
        h('div', null, h('b', { text: cob.prompts }), 'prompts no catálogo'),
        h('div', null, h('b', { text: '7' }), 'setores'),
        h('div', null, h('b', { text: '6' }), 'fases'),
        h('div', null, h('b', { text: '7' }), 'disciplinas'))),
    h('div', { class: 'formside' }, h('div', { class: 'box stack' }, titulo, sub, form, alterna,
      h('p', { class: 'faint', style: { fontSize: '.9em' }, text: 'A saída da IA é um rascunho analítico e exige validação humana. Não substitui o julgamento técnico, jurídico ou regulatório.' }))));
  document.body.append(raiz); desenha();
  setTimeout(() => email.inp.focus(), 0);
}
