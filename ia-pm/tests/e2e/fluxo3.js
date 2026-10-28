const { chromium } = require('playwright');
const SH = (process.env.IAPM_SHOTS || '/tmp/iapm-shots') + '/'; require('fs').mkdirSync(SH, { recursive: true });
const vis = (page) => page.locator('.panel:not([hidden])');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR', acceptDownloads: true });
  const page = await ctx.newPage();
  const erros = [];
  page.on('console', (m) => { if (m.type() === 'error') erros.push(`[console] ${m.text()}`); });
  page.on('pageerror', (e) => erros.push('[pageerror] ' + e.message));
  await page.goto('http://localhost:8765/'); await page.waitForSelector('#login');
  await page.click('text=Não tenho conta. Criar agora');
  await page.fill('#f-nome', 'Rafael Mendes'); await page.fill('#f-email', 'rafael@pmo.com.br'); await page.fill('#f-senha', 'SenhaForte123');
  await page.click('button[type=submit]'); await page.waitForSelector('#app'); await page.waitForTimeout(700);
  if (await page.isVisible('.tour-pop')) await page.click('text=Pular tour');

  // várias abas (teste do overflow horizontal)
  for (const k of ['Alt+L', 'Alt+N', 'Alt+E', 'Alt+U', 'Alt+I']) { await page.keyboard.press(k); await page.waitForTimeout(150); }
  const overflow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, appW: document.getElementById('app').getBoundingClientRect().width }));
  console.log('overflow horizontal?', overflow);
  await page.screenshot({ path: SH + '15-varias-abas.png' });

  // BYOK inválido + testar + execução com erro real do provedor
  await page.keyboard.press('Alt+U'); await page.waitForSelector('#byok');
  await page.fill('#byok', 'sk-ant-api03-chave-invalida-de-teste-1234567890'); await page.click('button:has-text("Salvar chave")'); await page.waitForTimeout(800);
  await page.click('button:has-text("Testar")'); await page.waitForTimeout(3000);
  console.log('teste da chave:', await page.locator('.toast').last().innerText());
  await page.screenshot({ path: SH + '16-byok.png' });
  await page.keyboard.press('Control+k'); await page.fill('.palette input', 'EVM'); await page.keyboard.press('Enter');
  await page.waitForSelector('.panel:not([hidden]) .split'); await page.waitForTimeout(500);
  await page.keyboard.press('Alt+X'); await page.waitForTimeout(1200);
  const fonteByok = page.locator('.panel:not([hidden]) label.choice:has-text("Minha chave de API")');
  await fonteByok.click();
  await page.selectOption('.panel:not([hidden]) select[id^="cl-"]', 'confidencial');
  await page.keyboard.press('Control+Enter');
  await page.waitForSelector('text=Gerando a análise', { timeout: 8000 }).catch(() => {});
  await page.waitForSelector('text=Não foi possível concluir a análise', { timeout: 40000 });
  console.log('erro exibido:', (await vis(page).locator('.callout.bad').innerText()).replace(/\n/g, ' '));
  await page.screenshot({ path: SH + '17-erro-provedor.png' });

  // API: criar chave
  await page.keyboard.press('Alt+I'); await page.waitForTimeout(500);
  console.log('API bloqueada p/ Explorar:', await vis(page).locator('.callout.warn').first().innerText().catch(() => 'sem aviso'));

  // Serviços: solicitar proposta
  await page.click('.act[title="Serviços PMO"]'); await page.waitForSelector('text=Serviços de PMO e gestão de projetos');
  await page.click('.panel:not([hidden]) >> text=Solicitar proposta >> nth=1'); await page.waitForSelector('.modal');
  await page.fill('#sv-mensagem', 'Precisamos estruturar o PMO de um projeto de expansão de mina.');
  await page.screenshot({ path: SH + '18-servicos-modal.png' });
  await page.click('.modal >> text=Enviar solicitação'); await page.waitForTimeout(800);
  console.log('lead:', await page.locator('.toast').last().innerText());

  // Tema escuro, tamanho de fonte e janela estreita
  await page.keyboard.press('Control+k'); await page.fill('.palette input', 'tema escuro'); await page.keyboard.press('Enter');
  await page.keyboard.press('Alt+H'); await page.waitForTimeout(600);
  await page.screenshot({ path: SH + '19-escuro.png' });
  await page.setViewportSize({ width: 820, height: 800 }); await page.waitForTimeout(500);
  await page.screenshot({ path: SH + '20-estreito.png' });
  console.log('erros:', erros);
  await browser.close();
})().catch((e) => { console.error('FALHOU', e); process.exit(1); });
