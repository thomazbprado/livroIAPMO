const { chromium } = require('playwright');
const SH = (process.env.IAPM_SHOTS || '/tmp/iapm-shots') + '/'; require('fs').mkdirSync(SH, { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR', acceptDownloads: true });
  const page = await ctx.newPage();
  const erros = [];
  page.on('console', (m) => { if (m.type() === 'error') erros.push(`[console] ${m.text()}`); });
  page.on('pageerror', (e) => erros.push('[pageerror] ' + e.message));
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('/v1/auth/eu')) erros.push(`[http ${r.status()}] ${r.request().method()} ${r.url()}`); });
  await page.goto('http://localhost:8765/');
  await page.waitForSelector('#login');
  await page.fill('#f-email', 'marina@exemplo.com.br'); await page.fill('#f-senha', 'SenhaForte123');
  await page.click('button[type=submit]'); await page.waitForSelector('#app');
  await page.waitForTimeout(700);
  if (await page.isVisible('.tour-pop')) await page.click('text=Pular tour');

  // 1) caso do livro em demonstração
  await page.click('text=Ver funcionando em 1 minuto');
  await page.waitForSelector('.split');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: SH + '05-prompt-evm.png' });
  const cpi = await page.locator('.verif', { hasText: 'CPI (EV / AC)' }).innerText();
  console.log('CPI na tela:', cpi.replace(/\n/g, ' | '));
  // classificação obrigatória
  await page.click('text=Gerar demonstração');
  await page.waitForTimeout(400);
  console.log('toast classificacao:', await page.locator('.toast').last().innerText());
  await page.selectOption('select[id^="cl-"]', 'interna');
  await page.keyboard.press('Control+Enter');
  await page.waitForSelector('text=Resumo executivo', { timeout: 15000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: SH + '06-execucao.png' });
  // validação humana
  await page.fill('#vf-papel', 'Controlador de projetos');
  for (const cb of await page.locator('#valid-' + (await page.evaluate(() => document.querySelector('[id^=valid-]').id.slice(6))) + ' input[type=checkbox]').all()) await cb.check();
  await page.screenshot({ path: SH + '07-validacao.png' });
  await page.click('text=Registrar validação');
  await page.waitForSelector('text=Aprovada por Marina Alves');
  console.log('validacao registrada');
  // exportar HTML (nova aba)
  const [pop] = await Promise.all([ctx.waitForEvent('page'), page.click('text=Documento (HTML para imprimir ou PDF)')]);
  await pop.waitForLoadState(); console.log('export html titulo:', await pop.title()); await pop.screenshot({ path: SH + '08-export-html.png' }); await pop.close();
  await page.click('text=Registro de Auditoria de IA (JSON)'); await page.waitForTimeout(600);
  console.log('auditoria JSON (Explorar deve bloquear):', await page.locator('.toast').last().innerText().catch(() => 'sem toast'));

  // 2) catálogo e assistente
  await page.keyboard.press('Alt+L'); await page.waitForSelector('.matrix'); await page.waitForTimeout(300);
  await page.screenshot({ path: SH + '09-catalogo.png' });
  await page.keyboard.press('Alt+N'); await page.waitForSelector('text=Em que setor está o seu projeto?');
  await page.click('.choice:has-text("Mineração")'); await page.click('.choice:has-text("FID")'); await page.waitForTimeout(300);
  await page.screenshot({ path: SH + '10-assistente.png' });

  // 3) paleta de comandos e menu
  await page.keyboard.press('Control+k'); await page.fill('.palette input', 'barragem'); await page.waitForTimeout(300);
  await page.screenshot({ path: SH + '11-paleta.png' });
  await page.keyboard.press('Escape');
  await page.click('.menu-top:has-text("Exibir")'); await page.waitForTimeout(200);
  await page.screenshot({ path: SH + '12-menu.png' });
  await page.keyboard.press('Escape');

  // 4) plano: resgatar código do livro
  await page.keyboard.press('Alt+U'); await page.waitForSelector('#cod');
  await page.fill('#cod', 'iapm-demo-leitor'); await page.click('button:has-text("Resgatar")');
  await page.waitForTimeout(1200);
  console.log('plano apos codigo:', (await page.locator('#statusbar').innerText()).replace(/\n/g, ' | '));
  await page.screenshot({ path: SH + '13-plano.png', fullPage: false });

  // 5) prompt bloqueado agora liberado + BYOK inválido gera erro real do provedor
  await page.keyboard.press('Control+k'); await page.fill('.palette input', 'barragem'); await page.keyboard.press('Enter');
  await page.waitForSelector('.panel:not([hidden]) .split'); await page.waitForTimeout(800);
  await page.screenshot({ path: SH + '14-prompt-liberado.png' });
  console.log('erros:', erros);
  await browser.close();
})().catch((e) => { console.error('FALHOU', e); process.exit(1); });
