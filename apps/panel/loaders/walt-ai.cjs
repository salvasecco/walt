/* eslint-disable @typescript-eslint/no-require-imports -- loader de Turbopack en CommonJS */
// Build-time shim for @walt/ai inside the panel (Turbopack). See docs/DECISIONES.md, "R1 panel".
// 1. Turbopack does not map './x.js' to './x.ts' in a workspace package: rewrite relative .js imports.
// 2. prompts.ts reads packages/ai/prompts/*.md from disk next to the source file; a bundled server
//    function (Vercel) has no such path. Inline the prompts as a string table instead.
// Fails the build loudly if prompts.ts changes shape, instead of breaking at runtime.
const fs = require("node:fs");
const path = require("node:path");

const DIR_RE = /const DIR = fileURLToPath\(new URL\(['"]\.\.\/prompts\/['"], import\.meta\.url\)\);/;
const READ_RE = /readFileSync\(`\$\{DIR\}\$\{name\}\.md`, ['"]utf8['"]\)/;

module.exports = function waltAiLoader(source) {
  let out = source.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)\.js(['"])/g, "$1$2.ts$3");
  if (path.basename(this.resourcePath) === "prompts.ts" && out.includes("../prompts/")) {
    if (!DIR_RE.test(out) || !READ_RE.test(out)) {
      throw new Error("walt-ai loader: packages/ai/src/prompts.ts cambió; actualizá apps/panel/loaders/walt-ai.cjs");
    }
    const dir = path.resolve(path.dirname(this.resourcePath), "../prompts");
    const files = {};
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".md")) continue;
      const file = path.join(dir, f);
      files[f] = fs.readFileSync(file, "utf8");
      if (typeof this.addDependency === "function") this.addDependency(file);
    }
    out = out
      .replace(DIR_RE, `const DIR = "";\nconst INLINE_PROMPTS = ${JSON.stringify(files)};`)
      .replace(READ_RE, "(INLINE_PROMPTS[`${name}.md`] ?? (() => { throw new Error(`Falta el prompt ${name}`); })())");
  }
  return out;
};
