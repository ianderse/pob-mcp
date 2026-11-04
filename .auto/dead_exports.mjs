#!/usr/bin/env node
// Lists exported symbols in src/ that are never imported by any file in src/ or tests/.
// Uses the TypeScript API to parse import declarations precisely.
import ts from 'typescript';
import { readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const DIRS = ['src', 'tests'];

function* walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (p.endsWith('.ts') && !p.endsWith('.d.ts')) yield p;
  }
}

const program = ts.createProgram(
  [...DIRS.flatMap((d) => [...walk(join(ROOT, d))])],
  { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, allowJs: false, noResolve: false, allowImportingTsExtensions: false }
);
const checker = program.getTypeChecker();

// importedName -> Set of importing files ; also track star-imports per module
const imported = new Map(); // `${file}::${name}` -> count
const starImportedFiles = new Set();

for (const sf of program.getSourceFiles()) {
  const f = sf.fileName;
  if (f.includes('node_modules')) continue;
  const rel = relative(ROOT, f);
  if (!rel.startsWith('src/') && !rel.startsWith('tests/')) continue;
  const bump = (k) => imported.set(k, (imported.get(k) || 0) + 1);
  ts.forEachChild(sf, (node) => {
    let spec, consume; // consume(clause)
    if (ts.isImportDeclaration(node) && node.moduleSpecifier) {
      spec = node.moduleSpecifier;
      consume = (clause) => {
        if (!clause) return;
        if (clause.name) bump(`${targetOf()}::default`);
        const nb = clause.namedBindings;
        if (nb && ts.isNamespaceImport(nb)) starImportedFiles.add(targetOf());
        else if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) bump(`${targetOf()}::${el.propertyName?.text || el.name.text}`);
      };
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      spec = node.moduleSpecifier;
      consume = (clause) => {
        if (!clause) { starImportedFiles.add(targetOf()); return; } // export * from
        if (ts.isNamespaceExport(clause)) { starImportedFiles.add(targetOf()); return; }
        for (const el of clause.elements) bump(`${targetOf()}::${el.propertyName?.text || el.name.text}`);
      };
    } else return;
    const sym = checker.getSymbolAtLocation(spec);
    const target = sym && (sym.valueDeclaration || sym.declarations?.[0])?.fileName;
    if (!target) return;
    function targetOf() { return target; }
    function bump(k) { imported.set(k, (imported.get(k) || 0) + 1); }
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      if (!clause) return; // side-effect import
      consume(clause);
    } else {
      consume(node.exportClause);
    }
  });

  // Inline `import('./mod.js').Name` type queries consume the named export
  // but are invisible to the declaration walk above.
  const visitTypeQueries = (node) => {
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && node.argument.literal && ts.isStringLiteral(node.argument.literal)) {
      const spec = node.argument.literal.text;
      if (spec.startsWith('.') && node.qualifier) {
        const abs = resolve(dirname(sf.fileName), spec).replace(/\.js$/, '.ts');
        const name = ts.isIdentifier(node.qualifier)
          ? node.qualifier.text
          : ts.isPropertyAccessExpression(node.qualifier) ? node.qualifier.name.text : undefined;
        if (name) bump(`${abs}::${name}`);
      }
    }
    node.forEachChild(visitTypeQueries);
  };
  visitTypeQueries(sf);
}

const dead = [];
for (const sf of program.getSourceFiles()) {
  const rel = relative(ROOT, sf.fileName);
  if (!rel.startsWith('src/') || sf.fileName.includes('node_modules')) continue;
  const f = sf.fileName;
  if (starImportedFiles.has(f)) continue;
  const moduleSymbol = checker.getSymbolAtLocation(sf);
  if (!moduleSymbol) continue;
  for (const exp of checker.getExportsOfModule(moduleSymbol)) {
    const name = exp.getName();
    if (name === 'default' && rel === 'src/index.ts') continue;
    const k = `${f}::${name}`;
    if (!imported.get(k)) dead.push(`${rel}:${name}`);
  }
}
dead.sort();
for (const d of dead) console.log(d);
console.log(`DEAD_COUNT ${dead.length}`);
