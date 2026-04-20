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
  await evalExpr("new Promise(resolve => { if (document.readyState === 'complete') resolve(true); else window.addEventListener('load', () => resolve(true), { once: true }); })");
  await sleep(5000);
  await evalExpr("document.getElementById('btn-compile').click(); true");
  await sleep(1800);

  const state = await evalExpr(`(() => ({
    title: document.title,
    codeMirror: !!document.querySelector('.CodeMirror'),
    pdfLibs: !!window.html2canvas && !!window.jspdf,
    katex: !!window.katex,
    localProjects: document.querySelectorAll('#pjlist .project-item').length,
    templates: document.querySelectorAll('#templates .template-item').length,
    cstatus: document.getElementById('cstatus')?.textContent || '',
    diag: document.getElementById('diag-summary')?.textContent || '',
    saveState: document.getElementById('save-state')?.textContent || '',
    cloudState: document.getElementById('cloud-state')?.textContent || '',
    exportMode: document.getElementById('pgexport')?.value || '',
    continuousExport: typeof exportContinuousPDF === 'function',
    pagedExport: typeof exportPagedPDF === 'function',
    smartBreaks: typeof smartBreaks === 'function',
    wheelRouting: typeof installWheelRouting === 'function',
    sandbox: document.getElementById('pvdoc')?.getAttribute('sandbox') || '',
    sameOrigin: (document.getElementById('pvdoc')?.getAttribute('sandbox') || '').includes('allow-same-origin'),
    hasSrcdoc: !!document.getElementById('pvdoc')?.srcdoc,
    fitPreviewScript: (document.getElementById('pvdoc')?.srcdoc || '').includes('htmlleafFit'),
    previewWheelScript: (document.getElementById('pvdoc')?.srcdoc || '').includes('htmlleafWheel'),
    localStorageBytes: (localStorage.getItem('htmlleaf.projects.v3') || '').length
  }))()`);
  const editorWheelWorked = await evalExpr(`(() => {
    const host = document.querySelector('.CodeMirror');
    const scroller = document.querySelector('.CodeMirror-scroll');
    if (!host || !scroller || scroller.scrollHeight <= scroller.clientHeight + 2) return true;
    const before = scroller.scrollTop;
    host.dispatchEvent(new WheelEvent('wheel', { deltaY: 600, bubbles: true, cancelable: true }));
    return scroller.scrollTop > before;
  })()`);

  await evalExpr("document.getElementById('pgori').value='landscape'; document.getElementById('pgori').dispatchEvent(new Event('change', { bubbles: true })); true");
  await sleep(1300);
  const pageSettingWorked = await evalExpr("document.getElementById('pvdoc').srcdoc.includes('297mm') && document.getElementById('pvdoc').srcdoc.includes('210mm')");

  const screenshot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));

  const failures = [];
  if (!state.title.includes("HTMLLeaf Studio")) failures.push("title did not initialize");
  if (!state.codeMirror) failures.push("CodeMirror editor did not render");
  if (!state.pdfLibs) failures.push("PDF libraries missing");
  if (!state.katex) failures.push("KaTeX missing");
  if (state.localProjects < 1) failures.push("local starter project missing");
  if (state.templates < 3) failures.push("templates missing");
  if (state.exportMode !== "continuous") failures.push("continuous PDF export is not the default");
  if (!state.continuousExport) failures.push("continuous PDF export function missing");
  if (!state.pagedExport || !state.smartBreaks) failures.push("smart paged PDF export functions missing");
  if (!state.wheelRouting) failures.push("wheel routing function missing");
  if (!editorWheelWorked) failures.push("mouse wheel did not scroll the editor");
  if (!state.cstatus.includes("Compiled")) failures.push("compile status did not update");
  if (state.sameOrigin) failures.push("iframe sandbox still allows same-origin");
  if (!state.hasSrcdoc) failures.push("preview srcdoc missing");
  if (!state.fitPreviewScript) failures.push("fit-preview script missing");
  if (!state.previewWheelScript) failures.push("preview wheel script missing");
  if (state.localStorageBytes < 100) failures.push("local project storage missing");
  if (!pageSettingWorked) failures.push("page orientation/size did not affect preview");
  if (exceptions.length) failures.push("runtime exceptions: " + exceptions.join(" | "));

  ws.close();
  chrome.kill();
  await sleep(300);
  fs.rmSync(profile, { recursive: true, force: true });

  console.log(JSON.stringify({
    ok: failures.length === 0,
    failures,
    state,
    pageSettingWorked,
    editorWheelWorked,
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
