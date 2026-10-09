import { readFileSync, writeFileSync } from "node:fs";

const SOURCE = "src/lib.rs";
const OUTPUT = "src/generated/exports.d.ts";

const PRIMITIVES = new Set([
  "u8",
  "u16",
  "u32",
  "u64",
  "usize",
  "i8",
  "i16",
  "i32",
  "i64",
  "isize",
  "f32",
  "f64",
]);

const EXPORT_PATTERN =
  /#\[unsafe\(no_mangle\)\]\s*pub\s+extern\s+"C"\s+fn\s+(\w+)\s*\(([^)]*)\)\s*(?:->\s*([^{]+?))?\s*\{/g;

/**
 * @typedef {object} Argument
 * @property {string} name
 * @property {string} rustType
 * @property {string} tsType
 */

/**
 * @typedef {object} WasmExport
 * @property {string} name
 * @property {Argument[]} args
 * @property {string} rustReturn
 * @property {string} tsReturn
 */

/**
 * @param {string} type
 * @returns {string}
 */
function mapType(type) {
  const normalized = type.trim();

  if (normalized === "bool") return "bool";
  if (/^[*&]/.test(normalized)) return "number";
  if (PRIMITIVES.has(normalized)) return "number";
  if (normalized === "()") return "void";

  throw new Error(`Unmapped Rust type: ${normalized}`);
}

/**
 * @param {string} argument
 * @returns {Argument}
 */
function parseArgument(argument) {
  const separator = argument.indexOf(":");

  if (separator === -1) {
    throw new Error(`Invalid Rust argument: ${argument}`);
  }

  const name = argument.slice(0, separator).trim();
  const rustType = argument.slice(separator + 1).trim();

  return {
    name,
    rustType,
    tsType: mapType(rustType),
  };
}

/**
 * @param {RegExpExecArray} match
 * @returns {WasmExport}
 */
function parseExport(match) {
  const [, name, rawArgs, rawReturn] = match;
  const rustReturn = rawReturn?.trim() || "()";

  return {
    name,
    args: rawArgs
      .split(",")
      .map((arg) => arg.trim())
      .filter(Boolean)
      .map(parseArgument),
    rustReturn,
    tsReturn: mapType(rustReturn),
  };
}

/**
 * Generates JSDoc and a TypeScript function signature.
 *
 * @param {WasmExport} fn
 * @returns {string}
 */
function renderExport(fn) {
  const docs = [
    "  /**",
    ...fn.args.map(
      ({ name, rustType }) => `   * @param ${name}: \`${rustType}\`.`,
    ),
    `   * @returns \`${fn.rustReturn}\`.`,
    "   */",
  ];

  const args = fn.args
    .map(({ name, tsType }) => `${name}: ${tsType}`)
    .join(", ");

  return `${docs.join("\n")}\n  ${fn.name}(${args}): ${fn.tsReturn};`;
}

function generate() {
  const source = readFileSync(SOURCE, "utf8");
  const exports = [...source.matchAll(EXPORT_PATTERN)].map(parseExport);
  const declaredExports = source.match(/no_mangle/g)?.length ?? 0;

  if (exports.length !== declaredExports) {
    throw new Error(
      `Parsed ${exports.length} exports, but found ${declaredExports} no_mangle attributes`,
    );
  }

  const functionDeclarations = exports.map(renderExport).join("\n\n");

  const output = `/**
 * Generated from src/lib.rs.
 * Do not edit manually.
 */

export type bool = 0 | 1;

export interface WasmFns {
${functionDeclarations}
}

/** Names of the exported Rust functions. */
export const EXPORT_NAMES: readonly [
  ${exports.map(({ name }) => JSON.stringify(name)).join(",\n  ")}
];
`;

  writeFileSync(OUTPUT, output);
  console.log(`Generated ${exports.length} exports`);
}

generate();
