# Testes de interface (navegador real)

Roteiros Playwright que percorrem a interface em um Chromium de verdade. Não fazem parte do `pytest`: exigem um servidor rodando com banco **novo** e o pacote `playwright` do Node.

```bash
# 1) servidor de teste: banco descartável, administrador da equipe e, para os fluxos 4 e 5, uma chave falsa da plataforma
IAPM_ENV=dev IAPM_DATABASE_URL=sqlite:////tmp/e2e.db IAPM_SECRET_KEY=segredo-de-teste-longo-o-bastante \
IAPM_ADMIN_EMAIL=staff@iapm.test IAPM_ADMIN_PASSWORD=SenhaStaff123 ANTHROPIC_API_KEY=sk-ant-chave-falsa \
python -m uvicorn app.main:app --port 8765

# 2) roteiros, em ordem, a partir deste diretório (as capturas de tela vão para $IAPM_SHOTS)
node fluxo1.js   # cadastro, tour e início
node fluxo2.js   # caso do livro em demonstração, validação humana, exportação, catálogo, paleta, plano e código do livro
node fluxo3.js   # várias abas, chave própria inválida (erro real do provedor), serviços, tema escuro e janela estreita
node fluxo4.js   # painel da equipe (códigos do livro), créditos gerenciados com erro seguro, chave de API
node fluxo5.js   # cadeados do catálogo após resgatar o código, tabela de projetos e totais ao vivo
```

Os roteiros usam o código de desenvolvimento `IAPM-DEMO-LEITOR` (vale uma vez por banco) e fazem uma chamada real à API do provedor com chave inválida, para provar o tratamento de erro. Nenhum deles consome crédito de IA. Para repetir a sequência, recrie o banco.
