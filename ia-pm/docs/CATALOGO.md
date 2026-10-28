# Guia do catálogo de prompts

Os prompts vivem em `content/prompts/*.json`, um arquivo por prompt. O servidor valida o catálogo inteiro ao subir: um prompt inválido impede a inicialização, com uma mensagem apontando o arquivo e o problema. Isso evita que um erro de edição chegue a um cliente.

## Como adicionar um prompt

1. Copie um arquivo parecido de `content/prompts/` e mude o `id` (formato `setor.fase.slug`, por exemplo `quimico.execucao.relatorio-parada`).
2. Escreva os cinco blocos RCTIF em `rctif` usando `{{variavel}}` para os dados do usuário.
3. Declare cada variável em `variaveis`, com o exemplo do livro em `padrao`.
4. Declare as contas que o código deve fazer em `verificacoes`.
5. Preencha `avisos`, `validacao_humana` e ao menos um `casos_de_teste` com os valores esperados.
6. Rode `python -m pytest tests -q`. Os testes calculam cada caso de teste e conferem o resultado.

## Campos do registro

| Campo | Obrigatório | Descrição |
|---|---|---|
| `id`, `versao` | sim | Identificador estável e versão (`1.0.0`). A versão é gravada em cada execução. Ao mudar o texto, suba a versão. |
| `titulo`, `resumo` | sim | Nome e uma frase sobre o que o prompt entrega. |
| `setor`, `fase`, `disciplinas` | sim | Valores de `content/taxonomia.json`. Uma combinação setor e fase sem prompt aparece como célula vazia na matriz de cobertura. |
| `rctif` | sim | `papel`, `contexto`, `tarefa`, `instrucoes`, `formato`. |
| `variaveis` | sim | Formulário do prompt (veja abaixo). |
| `verificacoes` | sim (pode ser lista vazia) | Contas feitas por código (veja abaixo). |
| `nivel_minimo` | não | `0` aberto a todos, `1` nível Leitor (padrão), `2` nível Equipe. |
| `modelo_recomendado` | não | `avancado`, `equilibrado` ou `rapido` (veja `content/modelos.json`). |
| `esforco` | não | Esforço de raciocínio do modelo: `low`, `medium`, `high`, `xhigh` ou `max`. |
| `saida_tokens_estimados` | não | Usado na estimativa de custo mostrada antes da execução. |
| `decisao_apoiada`, `quando_usar`, `nao_use_para` | recomendado | Orientam o usuário e aparecem na tela do prompt. |
| `classificacao_risco_uso` | recomendado | `baixo`, `medio` ou `alto` (pilar 1 da governança de IA do livro). |
| `o_que_voce_recebe` | recomendado | Lista curta do que o prompt entrega. |
| `avisos` | recomendado | Alertas específicos. O aviso geral de rascunho é incluído automaticamente. |
| `validacao_humana` | recomendado | `papeis_sugeridos` e `checklist`. O checklist aparece na tela de validação. |
| `casos_de_teste` | recomendado | `variaveis` (sobrescreve o exemplo) e `esperado` (id da verificação e valor). |
| `origem` | recomendado | De onde veio (por exemplo, `Capítulo 6, Prompt 6.2`). |

### Variáveis

Tipos: `texto`, `texto_longo`, `numero`, `moeda`, `percentual`, `selecao`, `data` e `tabela`.

- Números aceitam `1.234,56`, `1234.56`, `R$ 680` e `15,7%`.
- `obrigatoria` vale `true` por padrão. Use `false` para campos opcionais (por exemplo, o ETC do EVM).
- `unidade` aparece ao lado do campo. `minimo` e `maximo` limitam números.
- `padrao` é o exemplo do livro: aparece como dica no campo e é carregado pelo botão "Exemplo do livro".
- `tabela` exige `colunas`, cada uma com `nome`, `rotulo` e `tipo`. Use `rotulo_curto` para o texto do prompt, `sem_rotulo: true` para a coluna que descreve a linha, e `prefixo` e `sufixo` para unidades. Limites: `min_linhas` e `max_linhas`.

Toda variável declarada precisa ser usada em algum bloco RCTIF ou em alguma verificação. Toda variável usada precisa estar declarada.

### Verificações

Cada verificação é uma expressão numérica avaliada por um interpretador restrito (sem acesso a nada além de números, operações e as funções abaixo):

```json
{"id": "cpi", "rotulo": "CPI (EV / AC)", "expr": "ev / ac", "unidade": "", "casas": 3, "tolerancia_rel": 0.005}
```

- Operadores: `+ - * / % **`, comparações e `a if condicao else b`.
- Funções: `abs`, `min`, `max`, `round`, `sum` ou `soma`, `media`, `ponderada(valores, pesos)`, `npv` ou `vpl(taxa, fluxos)`, `irr` ou `tir(fluxos)`, `sqrt`, `len`.
- Variáveis numéricas entram pelo nome. Colunas de tabela entram como `tabela.coluna` e viram listas (`soma(projetos.capex)`).
- Variável opcional em branco torna a verificação "indisponível", com o motivo mostrado ao usuário. Nenhum valor é inventado.
- Verificação por linha de tabela:

```json
{"id": "score", "rotulo": "Score (P x I)", "por_linha": {"tabela": "riscos", "chave": "id", "expr": "p * i"}, "expr": "", "unidade": "pontos", "casas": 0}
```

  Gera um resultado por linha, com o identificador `score_R01`, `score_R02` e assim por diante.

Como funciona em tempo de execução: o código calcula, o modelo recebe os valores prontos em `<valores_calculados_pelo_sistema>` e devolve em `valores_reportados` os que usou, e o portal compara (`confere`, `diverge` ou `nao_reportado`). O que o texto do modelo diz fora de `valores_reportados` não é conferido: por isso a validação humana continua obrigatória.

## Regras de estilo

- Português do Brasil, sem travessões. Um teste automatizado falha se algum arquivo de `content/`, `web/` ou `app/` contiver travessão (em ou en).
- Instruções verificáveis: o modelo deve diferenciar dados, premissas, hipóteses e inferências e declarar o que falta. Essas regras já entram automaticamente como salvaguardas da plataforma, então não precisam ser repetidas em cada prompt.
- Não escreva no prompt normas, cláusulas ou números que o usuário não forneceu. Se o prompt precisa citar uma norma, torne-a uma variável (como a ANM 95/2022 no prompt de barragem) e avise que a vigência deve ser confirmada.
- Ao mudar um prompt publicado, suba a versão. O registro de auditoria guarda a versão e o texto exato enviado, então execuções antigas continuam rastreáveis.

## Taxonomia

`content/taxonomia.json` define os 7 setores, as 6 fases, as 7 disciplinas (domínios do PMBOK 8), as classificações de dados e os níveis de risco de uso. Para incluir um setor ou uma fase, edite esse arquivo: a matriz de cobertura e o assistente guiado se ajustam sozinhos.
