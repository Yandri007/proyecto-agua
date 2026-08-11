const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const safeUiSource = fs.readFileSync(
  path.join(__dirname, '..', '..', 'frontend', 'assets', 'safe-ui.js'),
  'utf8'
);

const runGuard = async ({ activeUser, expectedRoles, expectedUserId }) => {
  const listeners = new Map();
  const appended = [];
  let changedUser = null;

  const createElement = (tagName) => ({
    tagName,
    children: [],
    className: '',
    classList: { toggle() {} },
    append(...children) { this.children.push(...children); },
    appendChild(child) { this.children.push(child); return child; },
    addEventListener(type, handler) { this[`on${type}`] = handler; },
    setAttribute() {},
    focus() {}
  });
  const document = {
    readyState: 'loading',
    hidden: false,
    body: {
      dataset: {},
      appendChild(element) { appended.push(element); return element; },
      contains(element) { return appended.includes(element); }
    },
    createElement,
    querySelector() { return null; },
    addEventListener(type, handler) {
      const handlers = listeners.get(type) || [];
      handlers.push(handler);
      listeners.set(type, handlers);
    },
    removeEventListener(type, handler) {
      listeners.set(type, (listeners.get(type) || []).filter((item) => item !== handler));
    },
    dispatchEvent(event) {
      for (const handler of listeners.get(event.type) || []) handler(event);
      return true;
    }
  };
  class CustomEvent {
    constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
  }
  const window = {
    document,
    location: { assign() {} },
    setInterval() { return 1; },
    clearInterval() {},
    setTimeout() { return 1; },
    addEventListener() {}
  };
  const context = vm.createContext({
    window,
    document,
    CustomEvent,
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ user: activeUser }) }),
    setTimeout() { return 1; },
    clearTimeout() {}
  });
  vm.runInContext(safeUiSource, context);
  document.addEventListener('aquacontrol:session-changed', (event) => { changedUser = event.detail; });
  window.AquaUI.startSessionGuard(expectedRoles, expectedUserId);
  await new Promise((resolve) => setImmediate(resolve));
  return { appended, changedUser };
};

test('el guardián detecta que una pestaña cliente ahora tiene sesión de administrador', async () => {
  const result = await runGuard({
    activeUser: { id: 40, nombre: 'Administrador Demo', rol: 'admin' },
    expectedRoles: 'cliente',
    expectedUserId: 42
  });
  assert.equal(result.changedUser.rol, 'admin');
  assert.equal(result.appended[0].className, 'aq-session-overlay');
});

test('el guardián detecta el cambio entre dos usuarios del mismo rol', async () => {
  const result = await runGuard({
    activeUser: { id: 52, nombre: 'Otro Cliente', rol: 'cliente' },
    expectedRoles: 'cliente',
    expectedUserId: 42
  });
  assert.equal(result.changedUser.id, 52);
  assert.equal(result.appended[0].className, 'aq-session-overlay');
});
