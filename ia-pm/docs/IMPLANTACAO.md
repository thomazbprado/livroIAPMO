# Implantação do IA PM

O IA PM é uma aplicação com servidor (Python) e banco de dados. Isso define onde ele pode rodar.

## Onde hospedar

| Opção | Serve para o IA PM? | Observação |
|---|---|---|
| **Google Cloud Run + Cloud SQL (PostgreSQL)** | Sim, recomendada | Roda o contêiner deste repositório. Escala a zero, tem HTTPS e permite escolher a região do Brasil (`southamerica-east1`). Guarde as chaves no Secret Manager. |
| **Firebase Hosting na frente do Cloud Run** | Sim, como camada de domínio | Firebase Hosting não executa Python por si só, mas pode encaminhar (`rewrites`) todo o tráfego para o serviço do Cloud Run, com domínio próprio e CDN. Firestore e Authentication do Firebase não são usados: o IA PM tem o próprio banco e a própria autenticação. |
| **VPS com Docker Compose** (Hetzner, Locaweb, DigitalOcean etc.) | Sim | Use o `docker-compose.yml` e um proxy com HTTPS automático (Caddy ou Traefik). |
| **AWS (App Runner, ECS) ou Azure (Container Apps)** | Sim | Mesmo contêiner, com PostgreSQL gerenciado. |
| **HostGator (hospedagem compartilhada)** | Não para o aplicativo | A hospedagem compartilhada não executa este servidor. Ela serve bem para o site institucional e a página de vendas do livro, com um link para o app em um subdomínio, por exemplo `app.seudominio.com.br`. |

Arquitetura sugerida: site comercial (WordPress ou estático) no domínio principal e o IA PM em `app.seudominio.com.br`.

## Subir com Docker (local ou VPS)

```bash
cp .env.example .env        # edite: IAPM_SECRET_KEY, IAPM_ADMIN_*, POSTGRES_PASSWORD, ANTHROPIC_API_KEY
docker compose up --build   # http://localhost:8000
```

Em produção coloque um proxy com HTTPS na frente e defina `IAPM_ENV=prod`. Sem HTTPS, o cookie de sessão `Secure` não funciona. O `Dockerfile` confia nos cabeçalhos `X-Forwarded-*` de qualquer origem (`--forwarded-allow-ips "*"`), o que é correto atrás de Cloud Run, Caddy ou Traefik. Se o contêiner for exposto diretamente à internet, restrinja esse parâmetro ao IP do proxy, porque o limite de taxa por IP depende dele.

## Google Cloud Run (resumo dos passos)

1. Crie o projeto, habilite Cloud Run, Cloud SQL (PostgreSQL 16) e Secret Manager. Escolha a região `southamerica-east1` para manter os dados no Brasil.
2. Crie os segredos `IAPM_SECRET_KEY`, `ANTHROPIC_API_KEY` e `IAPM_ADMIN_PASSWORD`.
3. Publique: `gcloud run deploy iapm --source . --region southamerica-east1 --min-instances 1 --max-instances 1 --set-env-vars IAPM_ENV=prod,IAPM_BILLING_MODE=disabled --set-secrets IAPM_SECRET_KEY=...,ANTHROPIC_API_KEY=... --add-cloudsql-instances ...` e defina `IAPM_DATABASE_URL` com o socket do Cloud SQL (`postgresql+psycopg://usuario:senha@/iapm?host=/cloudsql/PROJETO:REGIAO:INSTANCIA`).
4. Mantenha **uma instância** (`max-instances 1`) enquanto o limitador de taxa e a fila forem em memória. Mantenha `min-instances 1` para que execuções longas não sejam interrompidas pela redução a zero. Aumente o tempo limite da requisição (`--timeout 900`) para execuções com `aguardar: true`.
5. Opcional: Firebase Hosting com `rewrites` para o serviço, para usar o domínio do projeto.
6. Agende a retenção de dados (Cloud Scheduler chamando um job que roda `python -m app.cli purge`).

## Variáveis de ambiente

Todas estão comentadas em `.env.example`. As essenciais em produção: `IAPM_ENV=prod`, `IAPM_SECRET_KEY`, `IAPM_DATABASE_URL`, `ANTHROPIC_API_KEY` (para créditos), `IAPM_ADMIN_EMAIL` e `IAPM_ADMIN_PASSWORD` (primeira subida), `IAPM_BILLING_MODE=disabled` até integrar pagamento.

## Do protótipo ao produto: lista de pendências do negócio

Estas decisões não podem ser tomadas pelo código. O portal já está preparado para recebê-las.

1. **Pagamento.** Hoje `IAPM_BILLING_MODE=demo` ativa planos e créditos sem cobrança. Para cobrar, integre um gateway (Stripe, Pagar.me, Mercado Pago, Asaas ou outro) em `app/billing.py`: o checkout cria a sessão de pagamento e um endpoint de webhook confirma e chama `_concede` (plano) ou `lanca` (créditos). Emita nota fiscal conforme o seu regime.
2. **Chave da plataforma.** Crie uma chave dedicada na conta do provedor de IA, defina limite de gasto e alerta de saldo. O log registra `CHAVE DA PLATAFORMA com problema` quando o provedor recusa a chave ou está sem saldo.
3. **Preços e margem.** Os valores de `content/planos.json` são hipóteses. Rode o portal por algumas semanas, meça `custo_usd` por execução (aba Administração e `GET /v1/uso`) e ajuste `margem_alvo`, `credito_preco_referencia_brl`, os créditos mensais e `IAPM_USD_BRL`. Revise os preços por token em `content/modelos.json` quando o provedor mudar a tabela.
4. **Textos jurídicos.** Publique Termos de Uso, Política de Privacidade (LGPD, com controlador, finalidades, retenção e subprocessadores, incluindo o provedor de IA) e o aviso de uso de IA. O texto da tela "Avisos legais" é uma base, não um substituto. Defina o prazo de retenção (`IAPM_RETENCAO_DIAS`) e agende `python -m app.cli purge`.
5. **Códigos do livro.** Gere os códigos no painel de Administração (Códigos do livro), imprima um por exemplar e defina o período de acesso (`dias`). Guarde o CSV: o sistema só guarda o hash. Em desenvolvimento existe o código `IAPM-DEMO-LEITOR`, que não é criado em produção.
6. **E-mail.** Integre um serviço de e-mail transacional para convites e redefinição de senha (hoje o convite é um código mostrado na tela).
7. **Conteúdo.** Cada prompt do livro foi estruturado a partir do texto do livro. Peça a revisão técnica de especialistas por setor antes de abrir ao público, e execute cada prompt com os modelos que pretende oferecer para validar a qualidade da saída (os testes automatizados cobrem os cálculos e a estrutura, não a qualidade da análise do modelo).
8. **Operação.** Backups do banco, monitoramento do endpoint `/saude`, alerta de erros e, ao crescer, Redis para o limitador de taxa e uma fila para as execuções.

## Operação

- **Saúde:** `GET /saude`.
- **Retenção:** `python -m app.cli purge [--dias N]` remove execuções e validações mais antigas que o prazo.
- **Criar administrador:** `python -m app.cli criar-admin email senha`.
- **Trocar `IAPM_SECRET_KEY`:** derruba todas as sessões e invalida as chaves BYOK salvas.
- **Logs:** não registram chaves, senhas nem o conteúdo dos prompts.
