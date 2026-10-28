const { chromium } = require('playwright');
const SH = (process.env.IAPM_SHOTS || '/tmp/iapm-shots') + '/'; require('fs').mkdirSync(SH, { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const erros = [];
  const novo = async () => { const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR' }); const p = await ctx.newPage();
    p.on('console', (m) => { if (m.type() === 'error') erros.push(`[console] ${m.text()}`); }); p.on('pageerror', (e) => erros.push('[pageerror] ' + e.message)); return p; };
  // staff gera códigos
  const staff = await novo();
  await staff.goto('http://localhost:8765/'); await staff.waitForSelector('#login');
  await staff.fill('#f-email', 'staff@iapm.test'); await staff.fill('#f-senha', 'SenhaStaff123'); await staff.click('button[type=submit]'); await staff.waitForSelector('#app');
  await staff.waitForTimeout(500);
  await staff.click('.act[title="Administração"]'); await staff.waitForSelector('text=Administração da plataforma');
  await staff.screenshot({ path: SH + '21-admin-resumo.png' });
  await staff.click('.subtab:has-text("Códigos do livro")');
  await staff.fill('.panel:not([hidden]) input[type=number] >> nth=0', '3'); await staff.fill('.panel:not([hidden]) input[type=text] >> nth=0', '1a edicao');
  await staff.click('button:has-text("Gerar códigos")'); await staff.waitForSelector('textarea[readonly]');
  const codigos = (await staff.inputValue('textarea[readonly]')).split('\n').filter(Boolean);
  console.log('codigos gerados:', codigos.length, codigos[0]);
  await staff.screenshot({ path: SH + '22-admin-codigos.png' });

  // leitor resgata, executa com créditos gerenciados (chave falsa -> erro seguro) e gera chave de API
  const p = await novo();
  await p.goto('http://localhost:8765/'); await p.waitForSelector('#login');
  await p.click('text=Não tenho conta. Criar agora'); await p.fill('#f-nome', 'Helena Costa'); await p.fill('#f-email', 'helena@epc.com.br'); await p.fill('#f-senha', 'SenhaForte123');
  await p.click('button[type=submit]'); await p.waitForSelector('#app'); await p.waitForTimeout(600); if (await p.isVisible('.tour-pop')) await p.click('text=Pular tour');
  await p.keyboard.press('Alt+U'); await p.waitForSelector('#cod'); await p.fill('#cod', codigos[0]); await p.click('button:has-text("Resgatar")'); await p.waitForTimeout(1000);
  console.log('status:', (await p.locator('#statusbar').innerText()).split('\n').slice(0, 3).join(' | '));
  await p.keyboard.press('Control+k'); await p.fill('.palette input', 'Revisão da matriz'); await p.keyboard.press('Enter');
  await p.waitForSelector('.panel:not([hidden]) .split'); await p.keyboard.press('Alt+X'); await p.waitForTimeout(1500);
  await p.screenshot({ path: SH + '23-prompt-matriz-riscos.png' });
  await p.selectOption('.panel:not([hidden]) select[id^="cl-"]', 'interna');
  const cred = p.locator('.panel:not([hidden]) label.choice:has-text("Créditos da plataforma")'); await cred.click();
  console.log('estimativa visivel:', (await cred.innerText()).replace(/\n/g, ' '));
  await p.keyboard.press('Control+Enter');
  await p.waitForSelector('text=Não foi possível concluir a análise', { timeout: 40000 });
  console.log('erro (creditos):', (await p.locator('.panel:not([hidden]) .callout.bad').innerText()).replace(/\n/g, ' '));
  await p.keyboard.press('Alt+U'); await p.waitForTimeout(800);
  console.log('saldo apos erro:', (await p.locator('#statusbar').innerText()).split('\n')[1]);
  await p.keyboard.press('Alt+I'); await p.waitForSelector('button:has-text("Nova chave")'); await p.click('button:has-text("Nova chave")');
  await p.fill('.modal input', 'Planilha EVM'); await p.click('.modal >> text=Criar chave'); await p.waitForSelector('text=Chave criada');
  const chave = await p.inputValue('.modal input[readonly]'); console.log('chave API:', chave.slice(0, 8) + '...');
  await p.screenshot({ path: SH + '24-api-chave.png' });
  await p.click('.modal >> text=Copiar e fechar');
  // usa a chave por HTTP
  const r = await p.evaluate(async (k) => { const x = await fetch('/v1/prompts', { headers: { Authorization: 'Bearer ' + k } }); const d = await x.json(); return [x.status, d.total]; }, chave);
  console.log('GET /v1/prompts com a chave:', r);
  console.log('erros:', erros);
  await browser.close();
})().catch((e) => { console.error('FALHOU', e); process.exit(1); });
