# Arquitetura do IA PM

```
Navegador (aplicativo web em estilo desktop, JavaScript puro, instalável como PWA)
   |  cookie de sessão (HttpOnly) + cabeçalho X-IAPM-Client        Excel, rotinas, sistemas
   |                                                                  |  Authorization: Bearer ipm_...
   v                                                                  v
+-----------------------------  FastAPI (app/)  -----------------------------+
| routers: auth, catálogo, execuções, conta, serviços, admin                  |
| catalog.py   carrega e valida content/prompts/*.json ao subir               |
| runner.py    validação, porta de dados, verificação, execução assíncrona    |
| engine/      render (RCTIF e saída), verify (contas), llm (provedores)      |
| billing.py   planos, créditos (livro-razão), código do livro                |
| security.py  scrypt, sessão assinada, chaves de API, cifra da chave BYOK    |
+------------------+----------------------------------------+-----------------+
                   |                                        |
         SQLAlchemy (SQLite ou PostgreSQL)        SDK oficial da Anthropic
                                                  (chave da plataforma ou BYOK)
```

## Fluxo de uma execução

1. **Entrada.** `POST /v1/prompts/{id}/executar` com as variáveis, a classificação dos dados e a fonte de IA.
2. **Porta de acesso.** Plano e nível do prompt, limite de taxa por organização, classificação dos dados (dados restritos não vão à IA, salvo política explícita da organização com chave própria), validação de cada variável.
3. **Verificação numérica.** O código calcula os indicadores declarados no prompt. Dado ausente vira "indisponível" com o motivo.
4. **Montagem.** O `system` recebe o papel do prompt mais as salvaguardas da plataforma. O `user` recebe o contexto (delimitado como dado, não como instrução), a tarefa, as instruções, o formato e os valores calculados. A saída é restrita a um esquema JSON.
5. **Chamada.** Fonte `creditos` usa a chave da plataforma; `byok` usa a chave cifrada da organização; `simulado` não chama ninguém. A chamada usa streaming e, nos modelos que suportam, o fallback do servidor para recusas.
6. **Conferência.** O que o modelo reportou em `valores_reportados` é comparado com o cálculo por código.
7. **Cobrança.** Só em caso de sucesso e só na fonte `creditos`: `créditos = custo em R$ / (1 - margem) / preço de referência do crédito`.
8. **Registro.** A execução guarda dados, prompt exato enviado, saída, conferência, tokens, custo e versão do prompt. A validação humana é um registro à parte, com checklist, decisão, instância decisória e condicionantes. Isso forma o Registro de Auditoria de IA (Tabela 7.2 do livro), exportável em JSON.

A execução é assíncrona: a API devolve `202` com a execução em andamento e o cliente consulta `GET /v1/execucoes/{id}` (ou envia `aguardar: true`). Execuções que ficam pendentes por reinício do processo são encerradas como erro, sem cobrança.

## Modelo de dados (resumo)

`orgs` (tenant, plano, BYOK cifrada, política) → `users` → `executions` → `validations`. Também: `api_keys` (guardadas como hash), `credit_entries` (livro-razão), `invites`, `redeem_codes` (guardados como hash), `leads`, `audit_events`. Toda consulta é filtrada pela organização; usuários "membro" enxergam só as próprias execuções, "admin" enxerga as da organização.

## Controles de segurança implementados

- Senhas com scrypt; política mínima de senha; limite de tentativas de entrada e de cadastro.
- Cookie de sessão `HttpOnly`, `SameSite=Lax` e `Secure` em produção; requisições que alteram dados exigem o cabeçalho `X-IAPM-Client` (defesa contra CSRF). Chaves de API não usam cookie.
- Chaves de API e códigos do livro guardados apenas como hash; a chave BYOK é cifrada (Fernet) e nunca devolvida.
- Cabeçalhos: CSP restritiva, `X-Frame-Options: DENY`, `nosniff`, HSTS em produção.
- A interface monta o DOM sem `innerHTML`; o HTML exportado escapa todo o conteúdo do modelo.
- Limite de tamanho de corpo (1 MB), limites de tamanho por campo, limite de taxa por organização conforme o plano.
- Isolamento entre organizações testado automaticamente.

## Limites conhecidos do MVP

- O limitador de taxa e a fila de execuções ficam em memória e atendem a um único processo. Para várias instâncias, troque por Redis e por uma fila (por exemplo, Cloud Tasks ou Celery).
- Não há integração com gateway de pagamento. `billing.checkout_demo` é o ponto de integração.
- Não há e-mail transacional: o convite e o código do livro são entregues na tela para o administrador repassar. Redefinição de senha por e-mail não existe ainda.
- O catálogo atual cobre 11 das 42 combinações de setor e fase.
- Único provedor de IA implementado: Anthropic. A interface de provedor (`engine/llm.py`) permite acrescentar outros.
