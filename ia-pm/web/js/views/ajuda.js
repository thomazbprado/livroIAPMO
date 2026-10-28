import { h, S, mount, icon } from '../core.js';
import { modal } from '../ui.js';

const GLOSSARIO = [
  ['RCTIF', 'Papel, Contexto, Tarefa, Instruções de análise e verificação, Formato. A estrutura de todo prompt do catálogo.'],
  ['FEL', 'Front-End Loading: fases de definição (FEL 1, 2 e 3) antes da decisão de investir.'], ['FID', 'Decisão Final de Investimento (Final Investment Decision).'],
  ['EVM', 'Gerenciamento do valor agregado: compara o planejado (PV), o realizado (EV) e o custo real (AC).'], ['CPI e SPI', 'Índices de desempenho de custo (EV/AC) e de prazo (EV/PV).'],
  ['EAC, VAC e TCPI', 'Estimativa no término, variação no término e desempenho necessário para concluir no orçamento.'], ['BYOK', 'Bring Your Own Key: usar a sua própria chave de API do provedor de IA.'], ['NPT', 'Non-Productive Time: tempo improdutivo em perfuração.'],
];

export function mostraAtalhos(comandos) {
  const itens = comandos.filter((c) => c.k);
  modal({ titulo: 'Atalhos de teclado', wide: true, corpo: h('div', { class: 'stack' }, h('div', { class: 'tscroll' }, h('table', { class: 'tbl' }, h('tbody', null,
    itens.map((c) => h('tr', null, h('td', { text: c.label }), h('td', null, h('kbd', { class: 'mono', text: c.k })))),
    h('tr', null, h('td', { text: 'Ir para a aba N' }), h('td', null, h('kbd', { class: 'mono', text: 'Alt+1 a Alt+9' })))))),
    h('p', { class: 'faint', text: 'Em Mac, use Option no lugar de Alt e Command no lugar de Ctrl.' })), botoes: [{ label: 'Fechar', primary: true }] });
}
export function mostraAvisos() {
  modal({ titulo: 'Avisos legais e limites de uso', wide: true, corpo: h('div', { class: 'stack' },
    h('div', { class: 'callout warn' }, icon('alert'), h('div', { text: 'Texto-base de aviso do produto. Ele não substitui os Termos de Uso e a Política de Privacidade da empresa, que devem ser revisados por assessoria jurídica antes da publicação.' })),
    h('ul', null,
      h('li', { text: 'A IA pode errar, omitir informação ou produzir texto convincente porém incorreto. Toda saída é um rascunho analítico e deve ser validada por pessoa qualificada.' }),
      h('li', { text: 'A plataforma não substitui o julgamento técnico, jurídico, regulatório, financeiro ou de segurança (SMS). A decisão e a responsabilidade permanecem com o usuário e com a sua organização.' }),
      h('li', { text: 'Os números marcados como "calculados por código" são determinísticos a partir dos dados informados. Dados incorretos geram resultados incorretos.' }),
      h('li', { text: 'Normas, resoluções e requisitos citados na saída devem ser confirmados nas fontes oficiais, incluindo vigência e aplicabilidade.' }),
      h('li', { text: 'O conteúdo do prompt é enviado ao provedor de IA para gerar a resposta. Não informe dados pessoais sensíveis, segredos industriais ou informação sujeita a sigilo. Observe a LGPD (Lei 13.709/2018) e as políticas da sua empresa.' }),
      h('li', { text: 'Preços, créditos, limites e prazos exibidos são ilustrativos e podem mudar.' }))),
    botoes: [{ label: 'Entendi', primary: true }] });
}
export function mostraSobre() {
  modal({ titulo: 'Sobre o IA PM e o livro', corpo: h('div', { class: 'stack' },
    h('p', null, h('b', { text: 'IA PM (IA Project Management) ' }), 'é o portal do livro ', h('i', { text: 'Inteligência Artificial na Gestão de Projetos de Capital' }), ', de Thomaz Barros de Carvalho Prado. Ele transforma os prompts do livro em um catálogo executável, organizado por setor, fase e disciplina, com números verificados por código, validação humana e registro de auditoria.'),
    h('p', { text: 'Os prompts seguem o framework RCTIF e as sete disciplinas do PMBOK 8: Governança, Escopo, Cronograma, Finanças, Partes Interessadas, Recursos e Riscos.' }),
    h('p', { class: 'faint', text: 'Versão 1.0. Os valores numéricos dos exemplos vêm dos casos didáticos do livro e não são referências de mercado.' })), botoes: [{ label: 'Fechar', primary: true }] });
}

export default function ajuda(tab, el) {
  const raiz = h('div', { class: 'wrap stack' }); el.append(raiz);
  const conceito = (ic, t, d) => h('div', { class: 'card hero-card' }, h('div', { class: 'ic' }, icon(ic, 'lg')), h('div', null, h('h3', { text: t }), h('div', { class: 'muted', text: d })));
  mount(raiz, h('div', null, h('h1', { text: 'Guia rápido' }), h('p', { class: 'muted', text: 'Quatro ideias explicam como o IA PM funciona.' })),
    h('div', { class: 'grid g2' },
      conceito('library', 'Catálogo por setor, fase e disciplina', 'Cada prompt do livro é um registro versionado, com variáveis, regras e avisos. Use a análise guiada ou a matriz de cobertura para achar o certo.'),
      conceito('calc', 'Números calculados por código', 'EVM, custos, desvios e totais são calculados pelo sistema e entregues prontos à IA. Depois, o portal confere o que o modelo reportou.'),
      conceito('clip', 'Validação humana e auditoria', 'Cada execução guarda quem validou, o checklist, a decisão e o prompt exato. É o Registro de Auditoria de IA do livro.'),
      conceito('shield', 'Classificação dos dados', 'Antes de executar, você classifica os dados. Dados restritos não vão para a IA. Com chave própria, a sua política decide.')),
    h('div', { class: 'card' }, h('h2', { text: 'Fluxo de trabalho' }), h('ol', null, ['Escolha o prompt (análise guiada, catálogo ou Ctrl+K).', 'Preencha os dados ou carregue o exemplo do livro.', 'Escolha a fonte de IA: créditos, sua chave ou demonstração.', 'Classifique os dados e execute.', 'Leia, confira os números, valide e exporte.'].map((t) => h('li', { text: t })))),
    h('div', { class: 'card' }, h('h2', { text: 'Glossário' }), h('div', { class: 'tscroll sp8' }, h('table', { class: 'tbl' }, h('tbody', null, GLOSSARIO.map(([t, d]) => h('tr', null, h('td', null, h('b', { text: t })), h('td', { text: d }))))))),
    h('div', { class: 'row wrap' }, h('button', { class: 'btn', type: 'button', onclick: () => mostraAvisos(), text: 'Avisos legais e limites de uso' }), h('button', { class: 'btn', type: 'button', onclick: () => mostraSobre(), text: 'Sobre o IA PM e o livro' })));
  return {};
}
