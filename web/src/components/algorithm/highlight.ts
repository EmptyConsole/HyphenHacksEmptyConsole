/** Lightweight JavaScript coloring so comments stay readable in the source box. */

export type TokenKind = "plain" | "comment" | "string" | "keyword" | "number";

export type Token = { kind: TokenKind; text: string };

type Mode = { type: "code" } | { type: "template" } | { type: "expr"; depth: number } | { type: "block" };

const KEYWORDS = new Set([
  "const",
  "let",
  "var",
  "function",
  "async",
  "await",
  "return",
  "if",
  "else",
  "for",
  "while",
  "do",
  "new",
  "throw",
  "try",
  "catch",
  "finally",
  "import",
  "from",
  "of",
  "in",
  "break",
  "continue",
  "class",
  "true",
  "false",
  "null",
  "undefined",
  "typeof",
  "switch",
  "case",
  "default",
  "this",
]);

function sourceLines(source: string) {
  const text = source.endsWith("\n") ? source.slice(0, -1) : source;
  return text.split("\n");
}

/** Inclusive 1-based line range covering the first `start` snippet through the following `end` snippet. */
export function lineRange(source: string, start: string, end: string): [number, number] | null {
  const lines = sourceLines(source);
  const from = lines.findIndex((line) => line.includes(start));
  if (from < 0) return null;
  const to = lines.findIndex((line, index) => index >= from && line.includes(end));
  if (to < 0) return null;
  return [from + 1, to + 1];
}

export function lineCount(source: string) {
  return sourceLines(source).length;
}

function isIdentStart(char: string) {
  return /[A-Za-z_$]/.test(char);
}

function isIdent(char: string) {
  return /[A-Za-z0-9_$]/.test(char);
}

function prevNonSpace(line: string, index: number) {
  for (let cursor = index - 1; cursor >= 0; cursor--) {
    if (line[cursor] !== " " && line[cursor] !== "\t") return line[cursor];
  }
  return "";
}

/** End index of a /regex/ starting at `index`, or null when it does not close on this line. */
function readRegex(line: string, index: number) {
  let cursor = index + 1;
  while (cursor < line.length) {
    if (line[cursor] === "\\") {
      cursor += 2;
      continue;
    }
    if (line[cursor] === "/") {
      cursor += 1;
      while (cursor < line.length && /[a-z]/.test(line[cursor])) cursor += 1;
      return cursor;
    }
    if (line[cursor] === "\n") return null;
    cursor += 1;
  }
  return null;
}

function scanLine(line: string, mode: Mode) {
  const tokens: Token[] = [];
  let plain = "";
  let index = 0;

  const flush = () => {
    if (!plain) return;
    tokens.push({ kind: "plain", text: plain });
    plain = "";
  };
  const emit = (kind: TokenKind, text: string) => {
    flush();
    if (text) tokens.push({ kind, text });
  };

  if (mode.type === "block") {
    const close = line.indexOf("*/");
    if (close < 0) {
      emit("comment", line);
      return { tokens, mode };
    }
    emit("comment", line.slice(0, close + 2));
    index = close + 2;
    mode = { type: "code" };
  }

  while (index < line.length) {
    if (mode.type === "template") {
      if (line.startsWith("${", index)) {
        emit("plain", "${");
        index += 2;
        mode = { type: "expr", depth: 1 };
        continue;
      }
      if (line[index] === "`") {
        emit("string", "`");
        index += 1;
        mode = { type: "code" };
        continue;
      }
      let end = index;
      while (end < line.length && line[end] !== "`" && !(line[end] === "$" && line[end + 1] === "{")) end += 1;
      emit("string", line.slice(index, end));
      index = end;
      continue;
    }

    const quote = line[index];
    if (quote === '"' || quote === "'") {
      let end = index + 1;
      while (end < line.length) {
        if (line[end] === "\\") {
          end += 2;
          continue;
        }
        if (line[end] === quote) {
          end += 1;
          break;
        }
        end += 1;
      }
      emit("string", line.slice(index, end));
      index = end;
      continue;
    }

    if (mode.type === "code" && line[index] === "`") {
      emit("string", "`");
      index += 1;
      mode = { type: "template" };
      continue;
    }

    if ((mode.type === "code" || mode.type === "expr") && line[index] === "/" && line[index + 1] === "/") {
      emit("comment", line.slice(index));
      index = line.length;
      break;
    }

    if (mode.type === "code" && line[index] === "/" && line[index + 1] === "*") {
      const close = line.indexOf("*/", index + 2);
      if (close < 0) {
        emit("comment", line.slice(index));
        index = line.length;
        mode = { type: "block" };
        break;
      }
      emit("comment", line.slice(index, close + 2));
      index = close + 2;
      continue;
    }

    if (
      (mode.type === "code" || mode.type === "expr") &&
      line[index] === "/" &&
      line[index + 1] !== "/" &&
      line[index + 1] !== "*"
    ) {
      const previous = prevNonSpace(line, index);
      if ("=([{!,:>&|?~".includes(previous)) {
        const end = readRegex(line, index);
        if (end !== null) {
          emit("string", line.slice(index, end));
          index = end;
          continue;
        }
      }
    }

    if (mode.type === "expr" && line[index] === "}") {
      if (mode.depth === 1) {
        emit("plain", "}");
        index += 1;
        mode = { type: "template" };
        continue;
      }
      mode = { type: "expr", depth: mode.depth - 1 };
      plain += "}";
      index += 1;
      continue;
    }

    if (mode.type === "expr" && line[index] === "{") {
      mode = { type: "expr", depth: mode.depth + 1 };
      plain += "{";
      index += 1;
      continue;
    }

    if (/[0-9]/.test(line[index]) && (index === 0 || !isIdent(line[index - 1]))) {
      let end = index;
      while (end < line.length && /[0-9]/.test(line[end])) end += 1;
      if (line[end] === "." && /[0-9]/.test(line[end + 1] ?? "")) {
        end += 1;
        while (end < line.length && /[0-9]/.test(line[end])) end += 1;
      }
      emit("number", line.slice(index, end));
      index = end;
      continue;
    }

    if (isIdentStart(line[index])) {
      let end = index + 1;
      while (end < line.length && isIdent(line[end])) end += 1;
      const word = line.slice(index, end);
      emit(KEYWORDS.has(word) ? "keyword" : "plain", word);
      index = end;
      continue;
    }

    plain += line[index];
    index += 1;
  }

  flush();
  return { tokens, mode };
}

export function highlightLines(source: string): Token[][] {
  const lines = sourceLines(source);
  let mode: Mode = { type: "code" };
  return lines.map((line) => {
    const scanned = scanLine(line, mode);
    mode = scanned.mode;
    return scanned.tokens;
  });
}
