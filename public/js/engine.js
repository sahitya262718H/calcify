// CalciFy formula engine
// Tokenizer -> Shunting Yard (infix to RPN) -> AST -> safe evaluator.
// No eval(), no Function(): only the operators and functions listed below can run.
// Works in the browser and in Node (Netlify Functions) unchanged.

export class FormulaError extends Error {
  constructor(message, pos = null, len = 1) {
    super(message);
    this.name = 'FormulaError';
    this.pos = pos;
    this.len = len;
  }
}

export const FUNCTIONS = {
  sqrt: { min: 1, max: 1, fn: (a) => { if (a < 0) throw new FormulaError('sqrt() of a negative number'); return Math.sqrt(a); }, doc: 'sqrt(x) square root' },
  abs: { min: 1, max: 1, fn: Math.abs, doc: 'abs(x) absolute value' },
  round: { min: 1, max: 2, fn: (a, d = 0) => { const f = 10 ** Math.trunc(d); return Math.round((a + Number.EPSILON) * f) / f; }, doc: 'round(x, decimals)' },
  floor: { min: 1, max: 1, fn: Math.floor, doc: 'floor(x) round down' },
  ceil: { min: 1, max: 1, fn: Math.ceil, doc: 'ceil(x) round up' },
  min: { min: 1, max: 50, fn: Math.min, doc: 'min(a, b, ...)' },
  max: { min: 1, max: 50, fn: Math.max, doc: 'max(a, b, ...)' },
  avg: { min: 1, max: 50, fn: (...a) => a.reduce((s, v) => s + v, 0) / a.length, doc: 'avg(a, b, ...)' },
  sum: { min: 1, max: 50, fn: (...a) => a.reduce((s, v) => s + v, 0), doc: 'sum(a, b, ...)' },
  pow: { min: 2, max: 2, fn: Math.pow, doc: 'pow(base, exp)' },
  mod: { min: 2, max: 2, fn: (a, b) => { if (b === 0) throw new FormulaError('mod() by zero'); return a % b; }, doc: 'mod(a, b) remainder' },
  ln: { min: 1, max: 1, fn: (a) => { if (a <= 0) throw new FormulaError('ln() needs a positive number'); return Math.log(a); }, doc: 'ln(x) natural log' },
  log: { min: 1, max: 1, fn: (a) => { if (a <= 0) throw new FormulaError('log() needs a positive number'); return Math.log10(a); }, doc: 'log(x) base-10 log' },
  exp: { min: 1, max: 1, fn: Math.exp, doc: 'exp(x) e to the power x' },
  sin: { min: 1, max: 1, fn: Math.sin, doc: 'sin(x) radians' },
  cos: { min: 1, max: 1, fn: Math.cos, doc: 'cos(x) radians' },
  tan: { min: 1, max: 1, fn: Math.tan, doc: 'tan(x) radians' },
  if: { min: 3, max: 3, lazy: true, doc: 'if(condition, then, else)' },
};

export const CONSTANTS = { pi: Math.PI };

// precedence / associativity
const BINARY = {
  '==': { p: 1, a: 'L' }, '!=': { p: 1, a: 'L' },
  '<': { p: 1, a: 'L' }, '>': { p: 1, a: 'L' }, '<=': { p: 1, a: 'L' }, '>=': { p: 1, a: 'L' },
  '+': { p: 2, a: 'L' }, '-': { p: 2, a: 'L' },
  '*': { p: 3, a: 'L' }, '/': { p: 3, a: 'L' },
  '^': { p: 5, a: 'R' },
};
const UNARY_PREC = 4; // -2^2 = -(2^2)

const isDigit = (c) => c >= '0' && c <= '9';
const isIdStart = (c) => /[A-Za-z_]/.test(c);
const isIdPart = (c) => /[A-Za-z0-9_]/.test(c);

export function tokenize(src) {
  const tokens = [];
  let i = 0;
  // "expectOperand" tells us whether the next token should be a value or an operator.
  // Used for: unary minus, and treating a bare "x" between two values as multiplication.
  let expectOperand = true;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    const start = i;

    if (isDigit(c) || (c === '.' && isDigit(src[i + 1] || ''))) {
      let s = '';
      while (i < src.length && (isDigit(src[i]) || src[i] === '.' || src[i] === '_')) {
        if (src[i] !== '_') s += src[i]; // allow 1_00_000 as a readable separator
        i++;
      }
      if ((src[i] === 'e' || src[i] === 'E') && /^[eE][+-]?\d/.test(src.slice(i, i + 3))) {
        s += src[i++];
        if (src[i] === '+' || src[i] === '-') s += src[i++];
        while (i < src.length && isDigit(src[i])) s += src[i++];
      }
      if ((s.match(/\./g) || []).length > 1) throw new FormulaError(`"${s}" is not a valid number`, start, i - start);
      if (!expectOperand) throw new FormulaError('Missing operator before this number', start, i - start);
      tokens.push({ t: 'num', v: parseFloat(s), pos: start, len: i - start });
      expectOperand = false;
      continue;
    }

    if (c === '[') {
      const end = src.indexOf(']', i);
      if (end === -1) throw new FormulaError('Missing closing ] for variable name', start, 1);
      const name = src.slice(i + 1, end).trim().replace(/\s+/g, ' ');
      if (!name) throw new FormulaError('Empty variable name []', start, end - start + 1);
      if (!expectOperand) throw new FormulaError(`Missing operator before [${name}]`, start, end - start + 1);
      tokens.push({ t: 'var', v: name, pos: start, len: end - start + 1 });
      i = end + 1;
      expectOperand = false;
      continue;
    }

    if (isIdStart(c)) {
      while (i < src.length && isIdPart(src[i])) i++;
      const name = src.slice(start, i);
      // "a x b" -> multiplication
      if (!expectOperand && /^[xX]\d/.test(name)) { // "5x3"
        tokens.push({ t: 'op', v: '*', pos: start, len: 1, display: 'x' });
        i = start + 1;
        expectOperand = true;
        continue;
      }
      if (!expectOperand && (name === 'x' || name === 'X')) {
        tokens.push({ t: 'op', v: '*', pos: start, len: 1, display: 'x' });
        expectOperand = true;
        continue;
      }
      if (!expectOperand) throw new FormulaError(`Missing operator before "${name}"`, start, name.length);
      let j = i;
      while (j < src.length && /\s/.test(src[j])) j++;
      if (src[j] === '(') {
        const fname = name.toLowerCase();
        if (!FUNCTIONS[fname]) throw new FormulaError(`Unknown function "${name}()"`, start, name.length);
        tokens.push({ t: 'fn', v: fname, pos: start, len: name.length });
        expectOperand = true; // the "(" comes next
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(CONSTANTS, name.toLowerCase()) && name.toLowerCase() === 'pi') {
        tokens.push({ t: 'num', v: CONSTANTS.pi, pos: start, len: name.length, constant: 'pi' });
      } else {
        tokens.push({ t: 'var', v: name, pos: start, len: name.length });
      }
      expectOperand = false;
      continue;
    }

    const two = src.slice(i, i + 2);
    if (['<=', '>=', '==', '!='].includes(two)) {
      if (expectOperand) throw new FormulaError(`Expected a value before "${two}"`, start, 2);
      tokens.push({ t: 'op', v: two, pos: start, len: 2 });
      i += 2; expectOperand = true; continue;
    }

    const map = { '×': '*', '÷': '/', '*': '*', '/': '/', '+': '+', '-': '-', '−': '-', '^': '^', '<': '<', '>': '>' };
    if (map[c]) {
      const op = map[c];
      if (expectOperand) {
        if (op === '-') { tokens.push({ t: 'neg', v: 'neg', pos: start, len: 1 }); i++; continue; }
        if (op === '+') { i++; continue; } // unary plus is a no-op
        throw new FormulaError(`Expected a value before "${c}"`, start, 1);
      }
      tokens.push({ t: 'op', v: op, pos: start, len: 1 });
      i++; expectOperand = true; continue;
    }

    if (c === '%') {
      if (expectOperand) throw new FormulaError('"%" must follow a value, e.g. 18%', start, 1);
      tokens.push({ t: 'pct', v: '%', pos: start, len: 1 });
      i++; continue; // still an operand afterwards
    }
    if (c === '(') {
      if (!expectOperand) throw new FormulaError('Missing operator before "("', start, 1);
      tokens.push({ t: 'lp', pos: start, len: 1 });
      i++; expectOperand = true; continue;
    }
    if (c === ')') {
      if (expectOperand) {
        const prev = tokens[tokens.length - 1];
        if (!(prev && prev.t === 'lp' && tokens[tokens.length - 2]?.t === 'fn')) {
          throw new FormulaError('Expected a value before ")"', start, 1);
        }
      }
      tokens.push({ t: 'rp', pos: start, len: 1 });
      i++; expectOperand = false; continue;
    }
    if (c === ',') {
      if (expectOperand) throw new FormulaError('Expected a value before ","', start, 1);
      tokens.push({ t: 'comma', pos: start, len: 1 });
      i++; expectOperand = true; continue;
    }
    throw new FormulaError(`Unexpected character "${c}"`, start, 1);
  }
  if (tokens.length && expectOperand) {
    const last = tokens[tokens.length - 1];
    throw new FormulaError('Formula ends with an operator, a value is missing', last.pos, last.len);
  }
  return tokens;
}

// Shunting Yard: tokens -> Reverse Polish Notation
export function toRPN(tokens) {
  const out = [];
  const ops = [];
  const argCounts = []; // per open function call

  for (const tk of tokens) {
    switch (tk.t) {
      case 'num': case 'var': out.push(tk); break;
      case 'pct': out.push(tk); break; // postfix binds tightest
      case 'fn': ops.push(tk); break;
      case 'neg': ops.push(tk); break;
      case 'op': {
        const o1 = BINARY[tk.v];
        while (ops.length) {
          const top = ops[ops.length - 1];
          if (top.t === 'neg') {
            if (UNARY_PREC > o1.p || (UNARY_PREC === o1.p && o1.a === 'L')) { out.push(ops.pop()); continue; }
            break;
          }
          if (top.t !== 'op') break;
          const o2 = BINARY[top.v];
          if (o2.p > o1.p || (o2.p === o1.p && o1.a === 'L')) out.push(ops.pop());
          else break;
        }
        ops.push(tk);
        break;
      }
      case 'lp': {
        const prev = ops[ops.length - 1];
        const isCall = prev && prev.t === 'fn';
        ops.push({ ...tk, call: isCall });
        if (isCall) argCounts.push({ n: 1, empty: true });
        break;
      }
      case 'comma': {
        while (ops.length && ops[ops.length - 1].t !== 'lp') out.push(ops.pop());
        const lp = ops[ops.length - 1];
        if (!lp || !lp.call) throw new FormulaError('Comma outside of a function call', tk.pos, 1);
        argCounts[argCounts.length - 1].n++;
        break;
      }
      case 'rp': {
        while (ops.length && ops[ops.length - 1].t !== 'lp') out.push(ops.pop());
        if (!ops.length) throw new FormulaError('Unmatched ")"', tk.pos, 1);
        const lp = ops.pop();
        if (lp.call) {
          const fnTok = ops.pop();
          const ac = argCounts.pop();
          const prevTok = tokens[tokens.indexOf(tk) - 1];
          const n = prevTok && prevTok.t === 'lp' ? 0 : ac.n;
          const def = FUNCTIONS[fnTok.v];
          if (n < def.min || n > def.max) {
            const want = def.min === def.max ? `${def.min}` : `${def.min}–${def.max}`;
            throw new FormulaError(`${fnTok.v}() takes ${want} value${def.max === 1 ? '' : 's'}, got ${n}`, fnTok.pos, fnTok.len);
          }
          out.push({ ...fnTok, argc: n });
        }
        break;
      }
      default: break;
    }
  }
  while (ops.length) {
    const op = ops.pop();
    if (op.t === 'lp') throw new FormulaError('Missing closing ")"', op.pos, 1);
    out.push(op);
  }
  return out;
}

// RPN -> AST
export function toAST(rpn) {
  const st = [];
  for (const tk of rpn) {
    switch (tk.t) {
      case 'num': st.push({ type: 'num', value: tk.v, constant: tk.constant }); break;
      case 'var': st.push({ type: 'var', name: tk.v, key: tk.v.toLowerCase().replace(/\s+/g, ' ') }); break;
      case 'pct': st.push({ type: 'pct', arg: pop(st, tk) }); break;
      case 'neg': st.push({ type: 'neg', arg: pop(st, tk) }); break;
      case 'op': { const r = pop(st, tk); const l = pop(st, tk); st.push({ type: 'bin', op: tk.v, left: l, right: r, display: tk.display }); break; }
      case 'fn': { const args = st.splice(st.length - tk.argc, tk.argc); st.push({ type: 'call', name: tk.v, args }); break; }
      default: break;
    }
  }
  if (st.length !== 1) throw new FormulaError('Formula is incomplete', 0, 1);
  return st[0];
}
function pop(st, tk) {
  if (!st.length) throw new FormulaError('Missing value', tk.pos, tk.len);
  return st.pop();
}

export function collectVariables(ast, out = new Map()) {
  if (!ast) return out;
  switch (ast.type) {
    case 'var': if (!out.has(ast.key)) out.set(ast.key, ast.name); break;
    case 'bin': collectVariables(ast.left, out); collectVariables(ast.right, out); break;
    case 'neg': case 'pct': collectVariables(ast.arg, out); break;
    case 'call': ast.args.forEach((a) => collectVariables(a, out)); break;
    default: break;
  }
  return out;
}

/** Parse a formula. Never throws: returns { ok, ast, variables, error }. */
export function parse(src) {
  const text = String(src ?? '');
  if (!text.trim()) return { ok: false, ast: null, variables: [], error: { message: 'Formula is empty', pos: 0, len: 0 } };
  if (text.length > 2000) return { ok: false, ast: null, variables: [], error: { message: 'Formula is too long (max 2000 characters)', pos: 0, len: 0 } };
  try {
    const ast = toAST(toRPN(tokenize(text)));
    const vars = [...collectVariables(ast)].map(([key, name]) => ({ key, name }));
    if (vars.length > 40) throw new FormulaError('Too many variables (max 40)', 0, 0);
    return { ok: true, ast, variables: vars, error: null };
  } catch (e) {
    if (e instanceof FormulaError) return { ok: false, ast: null, variables: [], error: { message: e.message, pos: e.pos, len: e.len } };
    throw e;
  }
}

/** Evaluate an AST with a values object keyed by variable key (lowercase). */
export function evaluate(ast, values = {}) {
  let steps = 0;
  const ev = (n) => {
    if (++steps > 100000) throw new FormulaError('Formula is too complex to evaluate');
    switch (n.type) {
      case 'num': return n.value;
      case 'var': {
        const v = values[n.key];
        if (v === undefined || v === null || v === '' || Number.isNaN(Number(v))) throw new FormulaError(`No value given for "${n.name}"`);
        return Number(v);
      }
      case 'neg': return -ev(n.arg);
      case 'pct': return ev(n.arg) / 100;
      case 'bin': {
        const a = ev(n.left); const b = ev(n.right);
        switch (n.op) {
          case '+': return a + b;
          case '-': return a - b;
          case '*': return a * b;
          case '/': if (b === 0) throw new FormulaError('Division by zero'); return a / b;
          case '^': return a ** b;
          case '<': return a < b ? 1 : 0;
          case '>': return a > b ? 1 : 0;
          case '<=': return a <= b ? 1 : 0;
          case '>=': return a >= b ? 1 : 0;
          case '==': return Math.abs(a - b) < 1e-12 ? 1 : 0;
          case '!=': return Math.abs(a - b) >= 1e-12 ? 1 : 0;
          default: throw new FormulaError(`Unknown operator ${n.op}`);
        }
      }
      case 'call': {
        if (n.name === 'if') return ev(n.args[0]) !== 0 ? ev(n.args[1]) : ev(n.args[2]);
        return FUNCTIONS[n.name].fn(...n.args.map(ev));
      }
      default: throw new FormulaError('Bad formula');
    }
  };
  const r = ev(ast);
  if (!Number.isFinite(r)) throw new FormulaError(Number.isNaN(r) ? 'Result is not a number' : 'Result is too large (infinite)');
  return r;
}

const PREC = (n) => {
  if (n.type === 'bin') return BINARY[n.op].p;
  if (n.type === 'neg') return UNARY_PREC;
  return 9;
};

/** Turn an AST back into readable text. If values given, variables are replaced by numbers. */
export function stringify(ast, values = null, fmt = (v) => String(v)) {
  const s = (n, parentPrec = 0, rightSide = false, parentOp = null) => {
    let out;
    switch (n.type) {
      case 'num': out = n.constant ? 'π' : fmt(n.value); break;
      case 'var': out = values ? (values[n.key] === undefined || values[n.key] === '' ? n.name : fmt(Number(values[n.key]))) : (/^[A-Za-z_][A-Za-z0-9_]*$/.test(n.name) ? n.name : `[${n.name}]`); break;
      case 'pct': out = `${s(n.arg, 9)}%`; break;
      case 'neg': out = `-${s(n.arg, UNARY_PREC + 1)}`; break;
      case 'call': out = `${n.name}(${n.args.map((a) => s(a, 0)).join(', ')})`; break;
      case 'bin': {
        const p = BINARY[n.op].p;
        const right = BINARY[n.op].a === 'R';
        const opText = n.op === '*' ? '×' : n.op === '/' ? '÷' : n.op;
        out = `${s(n.left, right ? p + 1 : p, false, n.op)} ${opText} ${s(n.right, right ? p : p + 1, true, n.op)}`;
        break;
      }
      default: out = '?';
    }
    const myPrec = PREC(n);
    const needs = myPrec < parentPrec || (values && n.type === 'num' && n.value < 0 && parentPrec > 0)
      || (values && n.type === 'var' && Number(values[n.key]) < 0 && parentPrec > 0);
    return needs ? `(${out})` : out;
  };
  return s(ast);
}

export function functionList() {
  return Object.entries(FUNCTIONS).map(([name, d]) => ({ name, doc: d.doc }));
}
