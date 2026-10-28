import { h, api, S, mount, icon, copiar, fmtData, emit } from '../core.js';
import { toast, confirmar, modal } from '../ui.js';

export default function apiView(tab, el) {
  const raiz = h('div', { class: 'wrap stack' }); el.append(raiz);
  let chaves = [];
  const base = location.origin;
  const exemploCurl = `curl -X POST ${base}/v1/prompts/renovavel.execucao.evm-recuperacao/executar \\
  -H "Authorization: Bearer $IAPM_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "classificacao_dados": "interna",
    "fonte_ia": "byok",
    "aguardar": true,
    "variaveis": {
      "ativo": "Parque eólico onshore", "potencia_mw": 150, "aerogeradores": 50,
      "semana_atual": 32, "semanas_total": 78,
      "bac": 680, "pv": 285, "ev": 248, "ac": 271,
      "causas": "Atraso na entrega de torres e retrabalho em fundações"
    }
  }'`;
  const exemploPy = `import os, requests

BASE = "${base}"
H = {"Authorization": f"Bearer {os.environ['IAPM_API_KEY']}"}

# 1) descobrir o catálogo
catalogo = requests.get(f"{BASE}/v1/prompts", headers=H).json()

# 2) executar um prompt e aguardar o resultado
r = requests.post(
    f"{BASE}/v1/prompts/renovavel.execucao.evm-recuperacao/executar",
    headers=H,
    json={"classificacao_dados": "interna", "fonte_ia": "creditos", "aguardar": True,
          "variaveis": {"ativo": "Parque eólico", "potencia_mw": 150, "aerogeradores": 50,
                        "semana_atual": 32, "semanas_total": 78,
                        "bac": 680, "pv": 285, "ev": 248, "ac": 271, "causas": "Atraso em torres"}},
)
ex = r.json()
print(ex["status"], [c["rotulo"] + ": " + c["status"] for c in ex["conferencia"]])

# 3) registrar a validação humana
requests.post(f"{BASE}/v1/execucoes/{ex['id']}/validacao", headers=H, json={
    "decisao": "aprovada_com_ressalvas", "validador_nome": "Maria Souza",
    "validador_papel": "Controladora de projetos", "justificativa": "Conferido na planilha de EVM."})`;
  const ENDPOINTS = [
    ['GET', '/v1/catalogo', 'Taxonomia, cobertura e resumos do catálogo (público)'], ['GET', '/v1/prompts', 'Lista de prompts, com filtros setor, fase, disciplina e q'], ['GET', '/v1/prompts/{id}', 'Prompt completo (RCTIF, variáveis e verificações)'],
    ['POST', '/v1/prompts/{id}/previa', 'Valida dados, calcula verificações e estima o custo'], ['POST', '/v1/prompts/{id}/renderizar', 'Devolve o prompt pronto para colar em qualquer ferramenta'], ['POST', '/v1/prompts/{id}/executar', 'Executa (aguardar: true espera o resultado)'],
    ['GET', '/v1/execucoes', 'Lista de execuções'], ['GET', '/v1/execucoes/{id}', 'Resultado, conferência numérica e validações'], ['POST', '/v1/execucoes/{id}/validacao', 'Registra a validação humana'], ['GET', '/v1/execucoes/{id}/auditoria', 'Registro de Auditoria de IA (JSON)'], ['GET', '/v1/uso', 'Consumo no período'],
  ];
  const bloco = (txt) => h('div', { class: 'stack' }, h('pre', { class: 'rctif mono', style: { overflow: 'auto', margin: 0, fontSize: '.88em' }, text: txt }), h('div', null, h('button', { class: 'btn sm', type: 'button', onclick: async () => toast((await copiar(txt)) ? 'Copiado.' : 'Falha ao copiar.', 'ok') }, icon('copy'), 'Copiar')));

  async function carrega() {
    try { chaves = (await api('/v1/chaves')).chaves; } catch { chaves = []; }
    desenha();
  }
  async function cria() {
    const nome = h('input', { class: 'inp', type: 'text', placeholder: 'Ex.: Planilha de controle', maxlength: 100, 'aria-label': 'Nome da chave' });
    modal({ titulo: 'Nova chave de API', corpo: h('div', { class: 'stack' }, h('p', { class: 'muted', text: 'Dê um nome que ajude a lembrar onde a chave será usada.' }), nome),
      botoes: [{ label: 'Cancelar' }, { label: 'Criar chave', primary: true, onclick: async () => {
        try {
          const r = await api('/v1/chaves', { method: 'POST', body: { nome: nome.value } });
          modal({ titulo: 'Chave criada', corpo: h('div', { class: 'stack' }, h('div', { class: 'callout warn' }, icon('alert'), r.aviso), h('input', { class: 'inp mono', readonly: true, value: r.chave, onfocus: (e) => e.target.select(), 'aria-label': 'Chave de API' })),
            botoes: [{ label: 'Copiar e fechar', primary: true, onclick: async () => { await copiar(r.chave); toast('Chave copiada.', 'ok'); } }] });
          carrega();
        } catch (e) { toast(e.message, 'bad'); return false; }
      } }] });
  }
  async function revoga(k) {
    if (!(await confirmar('Revogar chave', `Aplicações que usam a chave "${k.nome}" deixarão de funcionar.`, 'Revogar', true))) return;
    try { await api('/v1/chaves/' + k.id, { method: 'DELETE' }); toast('Chave revogada.', 'ok'); carrega(); } catch (e) { toast(e.message, 'bad'); }
  }
  function desenha() {
    const permitido = S.eu.plano.api;
    mount(raiz, h('div', null, h('h1', { text: 'API e integrações' }), h('p', { class: 'muted', text: 'Os mesmos prompts, com a mesma verificação numérica e o mesmo registro de auditoria, disponíveis por API REST para planilhas, rotinas e sistemas.' })),
      !permitido ? h('div', { class: 'callout warn' }, icon('lock'), h('div', null, h('b', { text: 'O acesso por API começa no nível Leitor. ' }), 'Resgate o código do livro ou assine para criar chaves.')) : null,
      h('div', { class: 'card' }, h('div', { class: 'row sb' }, h('h2', { text: 'Chaves de API' }), h('button', { class: 'btn primary', type: 'button', disabled: !permitido, onclick: cria }, icon('plus'), 'Nova chave')),
        chaves.length ? h('div', { class: 'tscroll sp12' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', { text: 'Nome' }), h('th', { text: 'Prefixo' }), h('th', { text: 'Criada em' }), h('th', { text: 'Último uso' }), h('th'))),
          h('tbody', null, chaves.map((k) => h('tr', null, h('td', { text: k.nome }), h('td', { class: 'mono', text: k.prefixo + '...' }), h('td', { text: fmtData(k.criado_em) }), h('td', { text: k.ultimo_uso ? fmtData(k.ultimo_uso) : 'nunca' }), h('td', null, h('button', { class: 'btn sm danger', type: 'button', onclick: () => revoga(k), text: 'Revogar' }))))))) : h('div', { class: 'faint sp12', text: 'Nenhuma chave ainda.' })),
      h('div', { class: 'card stack' }, h('h2', { text: 'Como usar' }),
        h('p', { class: 'muted', text: 'Envie a chave no cabeçalho Authorization: Bearer. A execução usa a fonte de IA indicada em fonte_ia ("byok", "creditos" ou "simulado"). Dados restritos nunca são aceitos para a IA.' }),
        h('h3', { text: 'curl' }), bloco(exemploCurl), h('h3', { text: 'Python' }), bloco(exemploPy),
        h('div', { class: 'callout info' }, icon('info'), h('div', { text: 'Dica para Excel e Power BI: use a consulta web (Power Query) com o mesmo cabeçalho e leia o JSON de /v1/execucoes/{id}. Conectores prontos fazem parte dos serviços de integração.' }))),
      h('div', { class: 'card' }, h('div', { class: 'row sb' }, h('h2', { text: 'Principais endpoints' }), h('a', { class: 'btn sm', href: '/docs', target: '_blank', rel: 'noopener' }, icon('ext'), 'Referência completa (OpenAPI)')),
        h('div', { class: 'tscroll sp12' }, h('table', { class: 'tbl' }, h('tbody', null, ENDPOINTS.map(([m, p, d]) => h('tr', null, h('td', null, h('span', { class: 'chip ' + (m === 'GET' ? 'info' : 'acc'), text: m })), h('td', { class: 'mono', text: p }), h('td', { text: d }))))))));
  }
  carrega();
  return { aoAtivar: carrega };
}
