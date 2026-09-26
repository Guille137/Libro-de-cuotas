// Prueba de integración real sin instalar dependencias. Requiere Chrome/Chromium.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep, basename } from 'node:path';
import assert from 'node:assert/strict';

const executable = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = await mkdtemp(join(tmpdir(), 'libro-cuotas-smoke-'));
const server = spawn(process.execPath, ['scripts/serve.mjs'], { windowsHide: true, stdio: 'ignore' });
const chrome = spawn(executable, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=9227', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let launchError;
chrome.on('error', error => { launchError = error; });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws;
try {
  let tabs;
  for (let i = 0; i < 15; i++) {
    if (launchError) throw launchError;
    try { tabs = await (await fetch('http://127.0.0.1:9227/json', { signal: AbortSignal.timeout(500) })).json(); if (tabs.length) break; } catch { /* esperar inicio */ }
    await sleep(100);
  }
  assert.ok(tabs?.length, 'Chrome debe iniciar');
  ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let sequence = 0;
  const requests = new Map();
  const errors = [];
  ws.onmessage = event => {
    const data = JSON.parse(event.data);
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.text);
    if (requests.has(data.id)) { const { resolve, reject } = requests.get(data.id); requests.delete(data.id); data.error ? reject(new Error(data.error.message)) : resolve(data.result); }
  };
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      requests.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  async function ready(enter = true) {
    for (let i = 0; i < 100; i++) {
      if (await evaluate('document.getElementById("app") && !document.getElementById("app").disabled')) {
        if (enter) await evaluate('if (!document.getElementById("landing").hidden) document.getElementById("entryLocal").click()');
        return;
      }
      await sleep(50);
    }
    throw new Error(await evaluate('document.body.innerText'));
  }
  await send('Runtime.enable');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await send('Page.navigate', { url: 'http://localhost:5173' });
  await ready(false);
  // Diagnóstico optativo: solo memoria; nunca adjunta, persiste ni captura el archivo.
  if (process.env.RECEIPT_DIAGNOSTIC_PATH) {
    const data = (await readFile(process.env.RECEIPT_DIAGNOSTIC_PATH)).toString('base64');
    const diagnostic = await evaluate(`(async () => {
      const {optimizeImage}=await import('/src/infrastructure/image-processing.js');
      const {validateImage}=await import('/src/infrastructure/receipts.js');
      const bytes=Uint8Array.from(atob(${JSON.stringify(data)}),c=>c.charCodeAt(0));
      const results=[];
      for (const type of ['image/jpeg','image/jpg','','application/octet-stream']) {
        const output=await optimizeImage(new File([bytes],'diagnostic.jpeg',{type}));
        results.push({inputType:type,outputType:await validateImage(output),size:output.size});
      }
      return results;
    })()`);
    assert.ok(diagnostic.every(result=>result.size>0 && result.size<=500*1024));
    console.log('Diagnóstico de imagen en memoria:',JSON.stringify(diagnostic));
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1050, deviceScaleFactor: 1, mobile: false });
  await mkdir('artifacts', { recursive: true });
  const capture = async name => writeFile(`artifacts/${name}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  const axeSource = await readFile('node_modules/axe-core/axe.min.js', 'utf8');
  async function audit(name) {
    await evaluate(axeSource);
    const violations = await evaluate(`axe.run(document, {runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}}).then(r => r.violations.map(v => ({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.html)})))`);
    assert.deepEqual(violations, [], `Accesibilidad: ${name}`);
  }
  await audit('portada clara'); await capture('landing');
  for (const [width,height] of [[390,844],[320,568],[740,360]]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
    assert.ok(await evaluate('document.documentElement.scrollHeight<=window.innerHeight && document.documentElement.scrollWidth<=window.innerWidth'),`Portada sin scroll ${width}x${height}`);
  }
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await evaluate('document.getElementById("themeSelect").value="dark"; document.getElementById("themeSelect").dispatchEvent(new Event("change"))');
  await audit('portada móvil oscura'); await capture('landing-mobile');
  await evaluate('document.getElementById("entryEmail").click()');
  await audit('acceso por correo');
  await evaluate('document.getElementById("accessSwitch").click()');
  assert.equal(await evaluate('document.getElementById("accessPassword").autocomplete'),'new-password');
  await audit('crear cuenta');
  await evaluate('document.getElementById("accessSwitch").click(); document.getElementById("accessReset").click()');
  assert.equal(await evaluate('document.getElementById("passwordField").hidden'),true);
  await audit('recuperar contraseña');
  // Controlador con proveedor simulado: sin crear usuarios ni enviar correos reales.
  await evaluate(`(async () => {
    document.getElementById('accessDialog').close();
    for (const id of ['accessDialog','entryActions']) { const node=document.getElementById(id); node.replaceWith(node.cloneNode(true)); }
    const {setupAccess}=await import('/src/ui/access.js');
    window.accessTest={opened:0,resets:0,resends:0,user:{emailVerified:false}};
    const state=window.accessTest;
    const client={auth:{currentUser:null},
      async register(){this.auth.currentUser=state.user;return state.user;},
      async loginEmail(){throw Object.assign(new Error('private detail'),{code:'auth/invalid-credential'});},
      async refreshUser(){return state.user;}, async resendVerification(){state.resends++;},
      async resetPassword(){state.resets++;}, async logout(){this.auth.currentUser=null;},
      async login(){return {emailVerified:true};}};
    setupAccess({getClient:()=>client,onAuthenticated:async()=>{state.opened++;},onLocal:()=>{}});
  })()`);
  await evaluate(`document.getElementById('entryEmail').click(); document.getElementById('accessEmail').value='test@example.test'; document.getElementById('accessPassword').value='invalid-password'; document.getElementById('accessSubmit').click(); new Promise(r=>setTimeout(r,30))`);
  assert.match(await evaluate('document.getElementById("accessMessage").textContent'),/no coinciden/);
  assert.equal(await evaluate('accessTest.opened'),0);
  await evaluate(`document.getElementById('accessReset').click(); document.getElementById('accessSubmit').click(); new Promise(r=>setTimeout(r,30))`);
  assert.equal(await evaluate('accessTest.resets'),1);
  await evaluate(`document.getElementById('accessSwitch').click(); document.getElementById('accessSwitch').click(); document.getElementById('accessPassword').value='new-password-123'; document.getElementById('accessSubmit').click(); new Promise(r=>setTimeout(r,30))`);
  assert.equal(await evaluate('document.getElementById("verificationActions").hidden'),false);
  assert.equal(await evaluate('accessTest.opened'),0,'Sin acceso antes de verificar');
  await audit('verificar correo');
  await evaluate(`document.getElementById('resendVerification').click(); new Promise(r=>setTimeout(r,30))`);
  assert.equal(await evaluate('accessTest.resends'),1);
  await evaluate(`document.getElementById('checkVerification').click(); new Promise(r=>setTimeout(r,30))`);
  assert.equal(await evaluate('accessTest.opened'),0);
  await evaluate(`accessTest.user.emailVerified=true; document.getElementById('checkVerification').click(); new Promise(r=>setTimeout(r,30))`);
  assert.equal(await evaluate('accessTest.opened'),1);
  assert.equal(await evaluate('document.getElementById("accessPassword").value'),'');
  await evaluate('document.getElementById("app").disabled=true'); await send('Page.reload'); await ready(false);
  await evaluate('document.getElementById("accessClose").click(); document.getElementById("themeSelect").value="light"; document.getElementById("themeSelect").dispatchEvent(new Event("change")); document.getElementById("entryLocal").click()');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
  await capture('desktop');
  await audit('escritorio');
  await evaluate('document.getElementById("themeSelect").value="dark"; document.getElementById("themeSelect").dispatchEvent(new Event("change"))');
  assert.equal(await evaluate('document.documentElement.dataset.theme'), 'dark');
  await audit('escritorio oscuro'); await capture('desktop-dark');
  await evaluate('document.getElementById("app").disabled=true'); await send('Page.reload'); await ready();
  assert.equal(await evaluate('document.getElementById("themeSelect").value'), 'dark');
  await evaluate('document.getElementById("themeSelect").value="light"; document.getElementById("themeSelect").dispatchEvent(new Event("change"))');
  await send('Emulation.setEmulatedMedia', {features:[{name:'prefers-color-scheme',value:'dark'}]});
  assert.equal(await evaluate('document.documentElement.dataset.theme'), 'light');
  assert.deepEqual(await evaluate('Array.from(document.getElementById("themeSelect").options, o=>o.value)'), ['light','dark']);
  await evaluate('localStorage.setItem("cuotas-theme","system"); document.getElementById("app").disabled=true');
  await send('Page.reload'); await ready();
  assert.equal(await evaluate('document.documentElement.dataset.theme'), 'light');
  await evaluate('document.getElementById("btnRename").click()');
  await audit('editar título');
  await evaluate('document.getElementById("bookTitleInput").value="   "; document.getElementById("btnSaveTitle").click()'); await ready();
  assert.equal(await evaluate('document.getElementById("renameError").hidden'), false);
  await evaluate('document.getElementById("bookTitleInput").value="<img src=x onerror=alert(1)>"; document.getElementById("btnSaveTitle").click()'); await ready();
  assert.equal(await evaluate('document.querySelectorAll("#bookTitle img").length'),0);
  assert.equal(await evaluate('document.getElementById("bookTitle").textContent'),'<img src=x onerror=alert(1)>');
  await evaluate('document.getElementById("btnRename").click(); document.getElementById("bookTitleInput").value="Mi departamento"; document.getElementById("btnSaveTitle").click()'); await ready();
  assert.equal(await evaluate('document.activeElement.id'),'btnRename');
  await evaluate('document.getElementById("app").disabled=true'); await send('Page.reload'); await ready();
  assert.equal(await evaluate('document.getElementById("bookTitle").textContent'),'Mi departamento');
  assert.equal(await evaluate('document.title'),'Mi departamento · Cuotas');
  await capture('desktop');
  await evaluate('document.getElementById("themeSelect").value="dark"; document.getElementById("themeSelect").dispatchEvent(new Event("change"))'); await capture('desktop-dark');
  await evaluate('document.getElementById("themeSelect").value="light"; document.getElementById("themeSelect").dispatchEvent(new Event("change"))');
  assert.equal(await evaluate('document.querySelectorAll("#rows tr").length'), 12);
  assert.equal(await evaluate('navigator.locks.request("libro-cuotas-editor", {ifAvailable:true}, lock => lock === null)'), true);
  await evaluate('document.getElementById("btnNext").click()');
  assert.equal(await evaluate('document.querySelector("#rows strong").textContent'), 'Cuota 13');
  await evaluate(`(() => { const input = document.getElementById('search'); input.value='no-existe'; input.dispatchEvent(new Event('input', {bubbles:true})); })()`);
  assert.equal(await evaluate('document.getElementById("emptyState").hidden'), false);
  await evaluate('document.getElementById("btnClearFilters").click()');
  await evaluate('document.getElementById("btnNextPay").click()');
  assert.equal(await evaluate('document.activeElement.id'), 'editPaidDate');
  await audit('registro de pago');
  await capture('payment-dialog');
  await evaluate('document.getElementById("themeSelect").value="dark"; document.getElementById("themeSelect").dispatchEvent(new Event("change"))');
  await audit('registro de pago oscuro'); await capture('payment-dialog-dark');
  await evaluate('document.getElementById("themeSelect").value="light"; document.getElementById("themeSelect").dispatchEvent(new Event("change"))');
  await evaluate(`document.getElementById('editPaidDate').value = ''; document.getElementById('btnSaveEdit').click()`);
  assert.equal(await evaluate('document.getElementById("editDialog").open'), true);
  await evaluate(`document.getElementById('editPaidDate').value='2026-09-25'; document.getElementById('editAmount').value='12.35'; document.getElementById('editNote').value='\"><img src=x onerror=alert(1)>'`);
  // Un error real de la capa de persistencia debe conservar el borrador visible.
  await evaluate(`window.testOriginalPut = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function() { throw new DOMException('Sin espacio', 'QuotaExceededError'); }; document.getElementById('btnSaveEdit').click()`);
  await ready();
  assert.equal(await evaluate('document.getElementById("editError").hidden'), false);
  assert.equal(await evaluate('document.getElementById("editAmount").value'), '12.35');
  await evaluate('IDBObjectStore.prototype.put = window.testOriginalPut; document.getElementById("btnSaveEdit").click()');
  await ready();
  assert.equal(await evaluate('document.getElementById("editDialog").open'), false);
  assert.equal(await evaluate('document.querySelectorAll("#rows img").length'), 0);
  assert.equal(await evaluate('document.getElementById("progressCount").textContent'), '1 de 58 cuotas pagadas');
  await evaluate('document.querySelector("#rows [data-action=edit]").click()');
  // Cancelar un borrador no modifica la cuota y permite volver al formulario.
  await evaluate(`document.getElementById('editNote').value='Borrador que no se guarda'; document.getElementById('btnCancelEdit').click()`);
  assert.equal(await evaluate('document.getElementById("confirmDialog").open'), true);
  await evaluate('new Promise(resolve => { document.getElementById("confirmDialog").addEventListener("close", () => requestAnimationFrame(() => resolve(true)), {once:true}); document.getElementById("confirmCancel").click(); })');
  assert.equal(await evaluate('document.getElementById("editNote").value'), 'Borrador que no se guarda');
  await evaluate('new Promise(resolve => { document.getElementById("editDialog").addEventListener("close", () => resolve(true), {once:true}); document.getElementById("btnCancelEdit").click(); document.getElementById("confirmAccept").click(); })');
  assert.equal(await evaluate('document.getElementById("editDialog").open'), false);
  await evaluate('document.querySelector("#rows [data-action=edit]").click()');
  assert.equal(await evaluate('document.getElementById("editNote").value'), '\"><img src=x onerror=alert(1)>');
  await evaluate(`(async () => {
    const canvas=document.createElement('canvas'); canvas.width=800; canvas.height=600;
    const context=canvas.getContext('2d'); context.fillStyle='#fff'; context.fillRect(0,0,800,600);
    context.fillStyle='#12394e'; context.font='30px sans-serif'; context.fillText('Comprobante de prueba',40,70); context.fillText('USD 12,35',40,140);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    // El selector del dispositivo puede entregar un MIME vacío aun siendo imagen.
    const transfer=new DataTransfer(); transfer.items.add(new File([blob],'prueba.png',{type:''}));
    const input=document.getElementById('receiptInput'); input.files=transfer.files; input.dispatchEvent(new Event('change',{bubbles:true}));
  })()`);
  await ready();
  assert.equal(await evaluate('document.getElementById("uploadPreview").open'), true);
  await audit('vista previa de imagen');
  await evaluate('document.getElementById("btnConfirmUpload").click()'); await ready();
  assert.equal(await evaluate('document.getElementById("btnViewReceipt").hidden'), false);
  await evaluate('document.getElementById("btnViewReceipt").click()'); await ready();
  assert.equal(await evaluate('document.getElementById("preview").open'), true);
  assert.ok(await evaluate('new Promise(resolve => {const img=document.getElementById("previewImage"); if(img.complete) resolve(img.naturalWidth>0); else {img.onload=()=>resolve(img.naturalWidth>0);img.onerror=()=>resolve(false);}})'));
  await evaluate('document.getElementById("preview").close(); document.getElementById("btnCloseEdit").click()');
  await sleep(30);
  const restored = await evaluate(`(async () => {
    const {BookService}=await import('/src/application/book-service.js'); const {openRepository}=await import('/src/infrastructure/indexed-db.js');
    const service=new BookService(await openRepository()); await service.initialize(); const backup=await service.exportBackup();
    await service.reset(); await service.importBackup(JSON.parse(backup)); const row=service.state.rows[0];
    return {title:service.state.title,paid:row.paid,amount:row.amountCents,file:(await service.repository.readReceipt(row.receipt.id)).size};
  })()`);
  assert.equal(restored.title,"Mi departamento"); assert.equal(restored.paid,true); assert.equal(restored.amount,1235); assert.ok(restored.file>0);
  await evaluate('document.getElementById("app").disabled=true'); await send('Page.reload'); await ready();
  await evaluate('document.querySelector("[data-filter=paid]").click()');
  assert.equal(await evaluate('document.querySelectorAll("#rows tr").length'),1);
  await evaluate('document.querySelector("[data-filter=all]").click(); document.getElementById("btnConfigure").click()');
  await audit('configuración expandida');
  await evaluate('document.getElementById("cfgTotal").value="59"; document.querySelector("#configForm button[type=submit]").click()');
  assert.equal(await evaluate('document.getElementById("confirmDialog").open'),true);
  assert.match(await evaluate('document.getElementById("confirmDescription").textContent'),/1 cuotas nuevas/);
  await evaluate('document.getElementById("confirmCancel").click(); document.getElementById("cfgTotal").value="58"; document.getElementById("cfgBox").open=false; document.getElementById("storageBox").open=true; document.querySelector(".danger-zone").open=true; document.getElementById("btnReset").click()');
  assert.equal(await evaluate('document.getElementById("confirmAccept").disabled'),true);
  await audit('confirmación destructiva');
  await evaluate('document.getElementById("confirmCancel").click(); document.getElementById("storageBox").open=false; window.scrollTo(0,0)');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert.ok(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),'Sin desborde móvil');
  await audit('móvil'); await capture('mobile');
  await evaluate('document.getElementById("themeSelect").value="dark"; document.getElementById("themeSelect").dispatchEvent(new Event("change"))');
  await audit('móvil oscuro'); await capture('mobile-dark');
  await evaluate('document.getElementById("ledgerTitle").scrollIntoView()'); await capture('mobile-ledger');
  await send('Emulation.setDeviceMetricsOverride',{width:320,height:720,deviceScaleFactor:1,mobile:true});
  assert.ok(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),'Sin desborde a 320 px');
  await evaluate('document.getElementById("btnNextPay").click()');
  await audit('formulario móvil a 320 px');
  assert.ok(await evaluate('document.getElementById("editDialog").scrollWidth<=document.getElementById("editDialog").clientWidth'),'Formulario sin desborde horizontal');
  await capture('mobile-payment');
  await send('Emulation.setDeviceMetricsOverride',{width:740,height:360,deviceScaleFactor:1,mobile:true});
  await audit('formulario horizontal');
  assert.ok(await evaluate('document.getElementById("editDialog").getBoundingClientRect().height<=window.innerHeight'),'Formulario dentro de pantalla horizontal');
  await evaluate('document.getElementById("btnCancelEdit").click()');
  await send('Emulation.setDeviceMetricsOverride',{width:320,height:720,deviceScaleFactor:1,mobile:true});
  await evaluate('document.getElementById("btnRename").click(); document.getElementById("bookTitleInput").value="A".repeat(80); document.getElementById("btnSaveTitle").click()'); await ready();
  assert.ok(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),'Título largo sin desborde a 320 px');
  const atomic = await evaluate(`(async () => {
    const {openRepository}=await import('/src/infrastructure/indexed-db.js'); const repo=await openRepository();
    const before=await repo.snapshot(); const original=IDBObjectStore.prototype.put; let rejected=false;
    IDBObjectStore.prototype.put=function(...args) {if(this.name==='state') throw new Error('Fallo simulado'); return original.apply(this,args);};
    try {await repo.commit({...before.state,title:'No debe guardarse'}, {replace:true,put:[{id:'new-file',blob:new Blob(['test'])}]});} catch {rejected=true;} finally {IDBObjectStore.prototype.put=original;}
    const after=await repo.snapshot();
    return {rejected,unchanged:JSON.stringify(before.state)===JSON.stringify(after.state),ids:after.receipts.map(r=>r.id),expected:before.receipts.map(r=>r.id),sameSize:after.receipts[0].blob.size===before.receipts[0].blob.size};
  })()`);
  assert.equal(atomic.rejected,true); assert.equal(atomic.unchanged,true); assert.deepEqual(atomic.ids,atomic.expected); assert.equal(atomic.sameSize,true);
  assert.deepEqual(errors,[]);
  console.log('OK Chrome: portada sin scroll, acceso por correo con proveedor simulado, verificación, recuperación, cuotas y respaldos. Axe: sin infracciones en 18 estados; escritorio, móvil de 320 px y horizontal.');
} finally {
  ws?.close();
  chrome.kill(); server.kill();
  await sleep(500);
  // Solo el directorio temporal creado por esta prueba.
  const safeProfile = resolve(profile);
  assert.ok(safeProfile.startsWith(resolve(tmpdir()) + sep) && basename(safeProfile).startsWith('libro-cuotas-smoke-'));
  await rm(safeProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
