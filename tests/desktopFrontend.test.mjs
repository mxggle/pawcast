import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "src");

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [target] : [];
  }));
  return nested.flat();
}

test("production frontend contains no Electron boundary or naming", async () => {
  const files = await sourceFiles(src);
  const violations = [];
  for (const file of files) {
    const relative = path.relative(root, file).split(path.sep).join("/");
    const content = await readFile(file, "utf8");
    if (content.includes("window.electronAPI")) violations.push(`${relative}: window.electronAPI`);
    if (/\bisElectron\b/.test(content)) violations.push(`${relative}: isElectron`);
    if (/components\/electron/.test(content)) violations.push(`${relative}: components/electron`);
    if (/electronStorage|subscribeElectronStorageChanges/.test(content)) violations.push(`${relative}: electron storage export`);
    if (/\b(?:export\s+(?:const|function|class|interface|type)\s+|interface\s+)Electron[A-Z]/.test(content)) {
      violations.push(`${relative}: Electron-prefixed export`);
    }
    if (!["src/platform/desktop/tauriDesktop.ts", "src/platform/runtime.ts"].includes(relative) && /@tauri-apps|__TAURI/.test(content)) {
      violations.push(`${relative}: Tauri implementation leak`);
    }
    if (/\/(?:Electron[A-Z][^/]*)\.(?:ts|tsx)$/.test(`/${relative}`)) {
      violations.push(`${relative}: Electron-prefixed filename`);
    }
  }
  assert.deepEqual(violations, []);
});

test("router lazy-loads desktop-neutral auxiliary pages", async () => {
  const router = await readFile(path.join(src, "router/AppRouter.tsx"), "utf8");
  assert.match(router, /pages\/DesktopSettingsWindowPage/);
  assert.match(router, /module\.DesktopSettingsWindowPage/);
  assert.match(router, /pages\/DesktopGlossaryWindowPage/);
  assert.match(router, /module\.DesktopGlossaryWindowPage/);
});

test("AppLayout selects desktop and web layouts through isDesktop", async () => {
  const layout = await readFile(path.join(src, "components/layout/AppLayout.tsx"), "utf8");
  assert.match(layout, /isDesktop\(\)/);
  assert.match(layout, /DesktopAppLayout/);
  assert.match(layout, /WebAppLayout/);
});
