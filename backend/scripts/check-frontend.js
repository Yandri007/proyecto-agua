const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert/strict');

const frontendRoot = path.join(__dirname, '..', '..', 'frontend');
const htmlFiles = [];

const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (entry.name.endsWith('.html')) {
      htmlFiles.push(fullPath);
    }
  }
};

walk(frontendRoot);

let scriptsChecked = 0;
for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const scriptPattern = /(<script(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)<\/script>/gi;
  let match;
  let index = 0;
  while ((match = scriptPattern.exec(html)) !== null) {
    index += 1;
    assert.match(match[1], /\bnonce="\{\{CSP_NONCE\}\}"/, `${file} tiene un script inline sin nonce`);
    new vm.Script(match[2], { filename: `${file}:script-${index}` });
    scriptsChecked += 1;
  }

  assert.doesNotMatch(
    html,
    /(?:cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|cdn\.sheetjs\.com)/i,
    `${file} conserva una dependencia CDN que debe servirse localmente`
  );
}

console.log(`Frontend verificado: ${htmlFiles.length} archivos, ${scriptsChecked} scripts`);
