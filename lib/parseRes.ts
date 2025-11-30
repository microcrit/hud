import { parse, format } from "kdljs";
import type { Node, Document, NodeTypeAnnotations } from "kdljs";
interface ResNode extends Node {
  directives?: string[];
  tags: NodeTypeAnnotations;
}
interface ResProperty {
  key: string;
  value: string;
  conditional?: string;
}
export function parseRes(input: string): ResNode {
  const lines = input.split('\n');
  const directives: string[] = [];
  let contentStartIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (trimmed.startsWith('#base') || trimmed.startsWith('#include')) {
      directives.push(trimmed);
    } else if (trimmed && !trimmed.startsWith('//')) {
      contentStartIdx = i;
      break;
    }
  }
  const parser = new VDFParser(lines.slice(contentStartIdx).join('\n'));
  const root: ResNode = {
    name: 'root',
    properties: {},
    children: [],
    values: [],
    tags: {
      name: undefined,
      values: [],
      properties: {}
    },
    directives
  };
  parser.parse(root);
  return root;
}
class VDFParser {
  private input: string;
  private pos: number = 0;
  constructor(input: string) {
    this.input = input;
  }
  private peek(): string {
    return this.input[this.pos] || '';
  }
  private advance(): void {
    this.pos++;
  }
  private skipWhitespaceAndComments(): void {
    while (this.pos < this.input.length) {
      const ch = this.peek();
      if (/\s/.test(ch)) {
        this.advance();
        continue;
      }
      if (ch === '/' && this.input[this.pos + 1] === '/') {
        while (this.pos < this.input.length && this.peek() !== '\n') {
          this.advance();
        }
        if (this.peek() === '\n') this.advance();
        continue;
      }
      break;
    }
  }
  private readQuotedString(): string {
    if (this.peek() !== '"') return '';
    this.advance();
    let result = '';
    while (this.pos < this.input.length) {
      const ch = this.peek();
      if (ch === '"') {
        this.advance();
        break;
      }
      if (ch === '\\' && this.input[this.pos + 1]) {
        this.advance();
        const escaped = this.peek();
        if (escaped === 'n') result += '\n';else if (escaped === 't') result += '\t';else if (escaped === '\\') result += '\\';else if (escaped === '"') result += '"';else result += escaped;
        this.advance();
      } else {
        result += ch;
        this.advance();
      }
    }
    return result;
  }
  private readUnquotedString(): string {
    let result = '';
    while (this.pos < this.input.length) {
      const ch = this.peek();
      if (/[\s{}"[\]]/.test(ch)) break;
      result += ch;
      this.advance();
    }
    return result;
  }
  private readKey(): string {
    this.skipWhitespaceAndComments();
    if (this.peek() === '"') {
      return this.readQuotedString();
    } else {
      return this.readUnquotedString();
    }
  }
  private readConditional(): string | null {
    this.skipWhitespaceAndComments();
    if (this.peek() !== '[') return null;
    this.advance();
    let result = '';
    let depth = 1;
    while (this.pos < this.input.length && depth > 0) {
      const ch = this.peek();
      if (ch === '[') depth++;else if (ch === ']') depth--;
      if (depth > 0) result += ch;
      this.advance();
    }
    return result || null;
  }
  parse(node: ResNode): void {
    while (this.pos < this.input.length) {
      this.skipWhitespaceAndComments();
      if (this.pos >= this.input.length) break;
      const ch = this.peek();
      if (ch === '}') {
        this.advance();
        return;
      }
      const key = this.readKey();
      if (!key) {
        if (this.peek() && this.peek() !== '}') this.advance();
        continue;
      }
      this.skipWhitespaceAndComments();
      
      const blockConditional = this.readConditional();
      this.skipWhitespaceAndComments();
      
      if (this.peek() === '{') {
        this.advance();
        const child: ResNode = {
          name: key,
          properties: {},
          children: [],
          values: [],
          tags: {
            name: undefined,
            values: [],
            properties: {}
          }
        };
        if (blockConditional) {
          (child.tags as any).conditional = blockConditional;
        }
        this.parse(child);
        node.children.push(child);
      } else if (this.peek() === '"' || this.peek() && !/[\s{}\[\]]/.test(this.peek())) {
        let value: string;
        if (blockConditional) {
          if (this.peek() === '"') {
            value = this.readQuotedString();
          } else {
            value = this.readUnquotedString();
          }
          this.skipWhitespaceAndComments();
          const valueConditional = this.readConditional();
          if (!node.properties) node.properties = {};
          if (valueConditional) {
            const propKey = `${key} [${valueConditional}]`;
            node.properties[propKey] = value;
          } else if (blockConditional) {
            const propKey = `${key} [${blockConditional}]`;
            node.properties[propKey] = value;
          } else {
            node.properties[key] = value;
          }
        } else {
          if (this.peek() === '"') {
            value = this.readQuotedString();
          } else {
            value = this.readUnquotedString();
          }
          this.skipWhitespaceAndComments();
          const conditional = this.readConditional();
          if (!node.properties) node.properties = {};
          if (conditional) {
            const propKey = `${key} [${conditional}]`;
            node.properties[propKey] = value;
          } else {
            node.properties[key] = value;
          }
        }
      } else if (blockConditional && (this.peek() === '' || this.peek() === '}' || this.peek() === '\n')) {
      }
    }
  }
}
export class ResParser {
  static parse(resContent: string, relativePath: string): Node | null {
    return parseRes(resContent);
  }
  static stringify(node: Node): string {
    let output = '';
    const resNode = node as ResNode;
    if (resNode.directives && resNode.directives.length > 0) {
      output += resNode.directives.join('\n') + '\n';
    }
    output += recurseStringifyVDF(node, 0);
    return output;
  }
}
function parsePropertyKey(propKey: string): {
  key: string;
  conditional: string | null;
} {
  const match = propKey.match(/^(.+?)\s+\[(.+)\]$/);
  if (match) {
    return {
      key: match[1]!,
      conditional: match[2]!
    };
  }
  return {
    key: propKey,
    conditional: null
  };
}
function parseNodeName(nodeName: string): {
  name: string;
  conditional: string | null;
} {
  const match = nodeName.match(/^(.+?)\s+\[(.+)\]$/);
  if (match) {
    return {
      name: match[1]!,
      conditional: match[2]!
    };
  }
  return {
    name: nodeName,
    conditional: null
  };
}

function recurseStringifyVDF(node: Node, indentLevel: number): string {
  const indent = '\t'.repeat(indentLevel);
  const resNode = node as ResNode;
  if (node.name === 'root') {
    let result = '';
    for (const child of node.children) {
      result += recurseStringifyVDF(child, indentLevel);
    }
    return result;
  }
  const { name: actualName, conditional: nameConditional } = parseNodeName(node.name);
  let result = `${indent}${formatVdfKey(actualName)}`;
  const conditional = nameConditional || (resNode.tags && typeof resNode.tags === 'object' ? (resNode.tags as any).conditional : null);
  if (conditional) {
    result += `\t[${conditional}]`;
  }
  result += `\n${indent}{\n`;
  if (node.properties) {
    for (const [propKey, value] of Object.entries(node.properties)) {
      const {
        key,
        conditional: propConditional
      } = parsePropertyKey(propKey);
      const strValue = String(value);
      if (propConditional) {
        result += `${indent}\t"${escapeString(key)}"\t\t"${escapeString(strValue)}"\t[${propConditional}]\n`;
      } else {
        result += `${indent}\t"${escapeString(key)}"\t\t"${escapeString(strValue)}"\n`;
      }
    }
  }
  for (const child of node.children) {
    result += recurseStringifyVDF(child, indentLevel + 1);
  }
  result += `${indent}}\n`;
  return result;
}
function escapeString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function vdfNeedsQuotes(str: string): boolean {
  return !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(str);
}

function formatVdfKey(str: string): string {
  if (vdfNeedsQuotes(str)) {
    return `"${escapeString(str)}"`;
  }
  return str;
}

function escapeKdlString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
function needsQuotes(str: string): boolean {
  return !/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(str);
}
export function kdlStringify(node: Node): string {
  const resNode = node as ResNode;
  let output = '';
  if (resNode.directives && resNode.directives.length > 0) {
    for (const directive of resNode.directives) {
      output += `// __DIRECTIVE__ ${directive}\n`;
    }
  }
  output += recurseKdlStringify(node, 0);
  return output;
}
function recurseKdlStringify(node: Node, indent: number): string {
  const indentStr = '  '.repeat(indent);
  const resNode = node as ResNode;
  const blockConditional = resNode.tags && typeof resNode.tags === 'object' ? (resNode.tags as any).conditional : null;
  let nodeName = node.name;
  if (blockConditional) {
    nodeName = `${node.name} [${blockConditional}]`;
  }
  const name = needsQuotes(nodeName) ? `"${escapeKdlString(nodeName)}"` : nodeName;
  let propsStr = '';
  for (const [key, value] of Object.entries(node.properties)) {
    const propKey = needsQuotes(key) ? `"${escapeKdlString(key)}"` : key;
    const propValue = escapeKdlString(String(value));
    propsStr += ` ${propKey}="${propValue}"`;
  }
  if (node.children.length === 0) {
    return `${indentStr}${name}${propsStr}\n`;
  }
  let result = `${indentStr}${name}${propsStr} {\n`;
  for (const child of node.children) {
    result += recurseKdlStringify(child, indent + 1);
  }
  result += `${indentStr}}\n`;
  return result;
}