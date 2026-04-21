const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const chromePath = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const appPath = path.resolve(__dirname, "index.html");
const fileUrl = "file:///" + appPath.replace(/\\/g, "/");
const port = 9333 + Math.floor(Math.random() * 400);
const profile = path.join(process.env.TEMP || __dirname, "htmlleaf-smoke-" + Date.now());
const screenshotPath = path.resolve(__dirname, "smoke-test.png");

const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--window-size=1440,1000",
  "--remote-debugging-port=" + port,
  "--user-data-dir=" + profile,
  fileUrl
], { stdio: ["ignore", "pipe", "pipe"] });

let stderr = "";
chrome.stderr.on("data", (data) => { stderr += data.toString(); });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getJson(route) {
  return new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port, path: route }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(error);
        }
      });
    }).on("error", reject);
  });
}

async function waitForTarget() {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    try {
      const list = await getJson("/json/list");
      const target = list.find((item) => item.type === "page" && item.url.startsWith("file:///")) || list.find((item) => item.type === "page");
      if (target && target.webSocketDebuggerUrl) return target.webSocketDebuggerUrl;
    } catch (error) {
      // Chrome may still be starting.
    }
    await sleep(250);
  }
  throw new Error("Chrome DevTools target did not appear. " + stderr.slice(0, 800));
}

async function main() {
  const wsUrl = await waitForTarget();
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  const exceptions = [];
  const logs = [];

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const waiter = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message));
      else waiter.resolve(message.result);
      return;
    }
    if (message.method === "Runtime.exceptionThrown") {
      const details = message.params.exceptionDetails;
      exceptions.push(details.text || details.exception?.description || "Runtime exception");
    }
    if (message.method === "Log.entryAdded") {
      const entry = message.params.entry;
      logs.push((entry.level || "log") + ": " + entry.text);
    }
  };

  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  function send(method, params = {}) {
    const id = nextId++;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  }

  async function evalExpr(expression) {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Evaluation failed");
    return result.result.value;
  }

  await send("Runtime.enable");
  await send("Log.enable");
  await send("Page.enable");
  await send("Page.bringToFront");
  await evalExpr("new Promise(resolve => { if (document.readyState === 'complete') resolve(true); else window.addEventListener('load', () => resolve(true), { once: true }); })");
  await sleep(4500);
  await evalExpr(`(() => {
    const filler = Array.from({ length: 220 }, (_, i) => '<p data-line="' + i + '">Smoke line ' + i + '</p>').join('\\n');
    const sample = [
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<head><meta charset="UTF-8"><title>Smoke Logic</title></head>',
      '<body>',
      '<h1 id="smoke-title">Smoke Logic</h1>',
      '<p data-smoke="yes">Shared logic path</p>',
      filler,
      '</body>',
      '</html>'
    ].join('\\n');
    cm.setValue(sample);
    syncWC();
    return true;
  })()`);
  await evalExpr("document.getElementById('btn-compile').click(); true");
  await sleep(1800);

  const state = await evalExpr(`(() => ({
    title: document.title,
    codeMirror: !!document.querySelector('.CodeMirror'),
    pdfLibs: !!window.html2canvas && !!window.jspdf,
    hasProjectPanel: !!document.getElementById('pjpanel'),
    hasInfoSidebar: !!document.getElementById('infosb'),
    hasFoundersLink: !!document.querySelector('a[href="founders.html"]'),
    projectButton: !!document.getElementById('btn-toggle-pj'),
    signInButtonVisible: getComputedStyle(document.getElementById('btn-signin-hdr')).display !== 'none',
    cstatus: document.getElementById('cstatus')?.textContent || '',
    statusText: document.getElementById('stxt')?.textContent || '',
    userCounter: document.getElementById('counter-num')?.textContent || '',
    sandbox: document.getElementById('pvdoc')?.getAttribute('sandbox') || '',
    sameOrigin: (document.getElementById('pvdoc')?.getAttribute('sandbox') || '').includes('allow-same-origin'),
    hasSrcdoc: !!document.getElementById('pvdoc')?.srcdoc,
    srcdocHasSmokeMarker: (document.getElementById('pvdoc')?.srcdoc || '').includes('data-smoke="yes"'),
    directCompileFlow: typeof compile === 'function' && String(compile).includes('pvdoc.srcdoc=src'),
    directPdfFlow: typeof downloadPDF === 'function' && String(downloadPDF).includes('pvdoc.contentDocument||pvdoc.contentWindow.document'),
    cloudProjectLogic: typeof loadPJ === 'function' && typeof savePJCloud === 'function' && typeof createPJCloud === 'function',
    nativeEditorOverflow: getComputedStyle(document.querySelector('.CodeMirror-scroll')).overflowY
  }))()`);
  const editorPoint = await evalExpr(`(() => {
    const rect = document.querySelector('.CodeMirror').getBoundingClientRect();
    window.__htmlleafWheelSeen = 0;
    document.addEventListener('wheel', () => { window.__htmlleafWheelSeen += 1; }, { capture: true });
    const info = cm.getScrollInfo();
    return { x: Math.floor(rect.left + rect.width / 2), y: Math.floor(rect.top + rect.height / 2), before: info.top, info };
  })()`);
  await send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: editorPoint.x,
    y: editorPoint.y
  });
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: editorPoint.x,
    y: editorPoint.y,
    button: "left",
    clickCount: 1
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: editorPoint.x,
    y: editorPoint.y,
    button: "left",
    clickCount: 1
  });
  await sleep(200);
  await send("Input.dispatchMouseEvent", {
    type: "mouseWheel",
    x: editorPoint.x,
    y: editorPoint.y,
    deltaY: 900,
    deltaX: 0
  });
  await sleep(700);
  const editorWheelState = await evalExpr(`(() => {
    const info = cm.getScrollInfo();
    const after = info.top;
    return { after, info, wheelSeen: window.__htmlleafWheelSeen || 0 };
  })()`);
  const syntheticWheelState = await evalExpr(`(() => {
    const scroller = cm.getScrollerElement ? cm.getScrollerElement() : document.querySelector('.CodeMirror-scroll');
    const before = cm.getScrollInfo().top;
    scroller.dispatchEvent(new WheelEvent('wheel', { deltaY: 900, bubbles: true, cancelable: true }));
    const after = cm.getScrollInfo().top;
    return { before, after };
  })()`);
  const editorWheelWorked = editorWheelState.after > (Number(editorPoint.before) || 0) || syntheticWheelState.after > syntheticWheelState.before;

  await evalExpr("document.getElementById('btn-save').click(); true");
  await sleep(400);
  const authState = await evalExpr(`(() => ({
    authModalShown: document.getElementById('auth-bg')?.classList.contains('show') || false,
    authTitle: document.querySelector('.auth-title')?.textContent || '',
    cloudLockedMessage: (document.getElementById('pjlist')?.textContent || '').includes('Sign in to save projects in the cloud')
  }))()`);
  const referenceSurface = await evalExpr(`(async () => {
    const sample = '<!DOCTYPE html><html><head><title>The Mathematical Lie</title></head><body><h1>The Mathematical Lie</h1><p>THIS WEEK\\'S LIE</p><p>1 = 2: An Algebraic Catastrophe</p><p>ABOUT THE MATHEMATICAL LIE</p></body></html>';
    const prepared = prepareReferenceSource(sample);
    const doc = new DOMParser().parseFromString(prepared, 'text/html');
    let styleStr = '';
    doc.querySelectorAll('style,link[rel="stylesheet"]').forEach((s) => { styleStr += s.outerHTML; });
    const holder = document.getElementById('pdf-render');
    holder.innerHTML = styleStr + (doc.body ? doc.body.innerHTML : '');
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const result = { width: holder.scrollWidth, height: holder.scrollHeight, hasMasthead: holder.textContent.includes('The Mathematical Lie') };
    holder.innerHTML = '';
    return result;
  })()`);

  const screenshot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));

  const failures = [];
  if (!state.title.includes("HTMLLeaf")) failures.push("title did not initialize");
  if (!state.codeMirror) failures.push("CodeMirror editor did not render");
  if (!state.pdfLibs) failures.push("PDF libraries missing");
  if (!state.hasProjectPanel || !state.hasInfoSidebar) failures.push("main side panels missing");
  if (!state.projectButton) failures.push("project toggle button missing");
  if (!state.hasFoundersLink) failures.push("founders link missing");
  if (state.nativeEditorOverflow !== "scroll" && state.nativeEditorOverflow !== "auto") failures.push("editor is not natively scrollable");
  if (!editorWheelWorked) failures.push("real Chrome mouse wheel did not scroll the editor");
  if (!state.cstatus.includes("✓") && !state.cstatus.includes(":")) failures.push("compile status did not update");
  if (!state.sameOrigin) failures.push("iframe sandbox no longer follows shared-file same-origin preview logic");
  if (!state.hasSrcdoc) failures.push("preview srcdoc missing");
  if (!state.srcdocHasSmokeMarker) failures.push("compile no longer mirrors editor HTML directly into preview");
  if (!state.directCompileFlow) failures.push("compile logic no longer uses direct srcdoc flow");
  if (!state.directPdfFlow) failures.push("PDF export logic no longer reads directly from the preview iframe");
  if (!state.cloudProjectLogic) failures.push("cloud project logic missing");
  if (!authState.authModalShown || !authState.authTitle.includes("Save your work forever")) failures.push("signed-out save no longer opens the auth modal");
  if (!authState.cloudLockedMessage) failures.push("signed-out projects panel no longer shows the cloud lock state");
  if (referenceSurface.width !== 740 || referenceSurface.height !== 1390) failures.push("reference edition export surface drifted from the target 740x1390 layout");
  if (!referenceSurface.hasMasthead) failures.push("reference edition generator missing masthead content");
  if (exceptions.length) failures.push("runtime exceptions: " + exceptions.join(" | "));

  ws.close();
  chrome.kill();
  await sleep(300);
  fs.rmSync(profile, { recursive: true, force: true });

  console.log(JSON.stringify({
    ok: failures.length === 0,
    failures,
    state,
    authState,
    referenceSurface,
    editorWheelWorked,
    editorPoint,
    editorWheelState,
    syntheticWheelState,
    exceptions,
    logs: logs.slice(0, 8),
    screenshotPath
  }, null, 2));

  process.exit(failures.length ? 1 : 0);
}

main().catch((error) => {
  try { chrome.kill(); } catch (ignored) {}
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (ignored) {}
  console.error(error.stack || error.message);
  process.exit(1);
});
