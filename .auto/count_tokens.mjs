#!/usr/bin/env node
// AST-based debt token counter: replaces fragile grep detectors.
// Counts in src/**/*.ts only. Outputs `NAME=value` lines.
import ts from 'typescript';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC = resolve(import.meta.dirname, '../src');
function* walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (p.endsWith('.ts') && !p.endsWith('.d.ts')) yield p;
  }
}

let anyCount = 0, nonNull = 0, emptyCatch = 0, tsIgnore = 0;
for (const f of walk(SRC)) {
  const text = readFileSync(f, 'utf8');
  tsIgnore += (text.match(/@ts-(?:ignore|expect-error|nocheck)/g) || []).length;
  const sf = ts.createSourceFile(f, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const visit = (node) => {
    if (node.kind === ts.SyntaxKind.AnyKeyword) anyCount++;
    else if (ts.isNonNullExpression(node)) nonNull++;
    else if (ts.isCatchClause(node) && node.block.statements.length === 0) emptyCatch++;
    node.forEachChild(visit);
  };
  visit(sf);
}
console.log(`ANY=${anyCount}`);
console.log(`NONNULL=${nonNull}`);
console.log(`EMPTYCATCH=${emptyCatch}`);
console.log(`TSIGNORE=${tsIgnore}`);
