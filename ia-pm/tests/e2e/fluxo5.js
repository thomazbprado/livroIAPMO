const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const erros = []; page.on('pageerror', (e) => erros.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  await page.goto('http://localhost:8765/'); await page.waitForSelector('#login');
  await page.click('text=Não tenho conta. Criar agora'); await page.fill('#f-nome', 'Paulo Lima'); await page.fill('#f-email', 'paulo@mineradora.com.br'); await page.fill('#f-senha', 'SenhaForte123');
  await page.click('button[type=submit]'); await page.waitForSelector('#app'); await page.waitForTimeout(600); if (await page.isVisible('.tour-pop')) await page.click('text=Pular tour');
  const travas = () => page.locator('#sidebar .leaf svg.i').count();
  console.log('cadeados antes:', await travas());
  await page.keyboard.press('Alt+U'); await page.waitForSelector('#cod'); await page.fill('#cod', 'IAPM-DEMO-LEITOR'); await page.click('button:has-text("Resgatar")'); await page.waitForTimeout(1500);
  console.log('cadeados depois:', await travas());
  // execução com créditos (chave da plataforma falsa) e API
  await page.keyboard.press('Control+k'); await page.fill('.palette input', 'Triagem'); await page.keyboard.press('Enter');
  await page.waitForSelector('.panel:not([hidden]) .split'); await page.keyboard.press('Alt+X'); await page.waitForTimeout(1200);
  await page.selectOption('.panel:not([hidden]) select[id^="cl-"]', 'interna');
  const cred = page.locator('.panel:not([hidden]) label.choice:has-text("Créditos da plataforma")'); await cred.click();
  await page.waitForTimeout(500);
  // tabela de projetos preenchida pelo exemplo
  console.log('linhas da tabela de projetos:', await page.locator('.panel:not([hidden]) table.tbl tbody tr').count());
  console.log('totais calculados:', (await page.locator('.panel:not([hidden]) .verif').allInnerTexts()).map((t) => t.replace(/\n/g, ' ')).join(' | '));
  await page.keyboard.press('Control+Enter'); await page.waitForSelector('text=Não foi possível concluir a análise', { timeout: 40000 });
  console.log('erro com créditos:', (await page.locator('.panel:not([hidden]) .callout.bad').innerText()).replace(/\n/g, ' '));
  console.log('erros JS:', erros);
  await browser.close();
})().catch((e) => { console.error('FALHOU', e); process.exit(1); });
