import { parse, evaluate, stringify } from '../public/js/engine.js';
import assert from 'node:assert/strict';

let pass = 0;
const run = (src, vals = {}) => {
  const p = parse(src);
  if (!p.ok) throw new Error(`parse failed for "${src}": ${p.error.message}`);
  return evaluate(p.ast, vals);
};
const eq = (src, vals, want) => {
  const got = run(src, vals);
  assert.ok(Math.abs(got - want) < 1e-9, `${src} => ${got}, want ${want}`);
  pass++;
};
const bad = (src, frag) => {
  const p = parse(src);
  assert.equal(p.ok, false, `expected error for "${src}"`);
  if (frag) assert.match(p.error.message, frag, `${src}: ${p.error.message}`);
  pass++;
};

eq('1 + 2 * 3', {}, 7);
eq('(1 + 2) * 3', {}, 9);
eq('2 ^ 3 ^ 2', {}, 512);
eq('-2 ^ 2', {}, -4);
eq('2 ^ -1', {}, 0.5);
eq('10 - 3 - 2', {}, 5);
eq('100 / 10 / 2', {}, 5);
eq('--3', {}, 3);
eq('+5', {}, 5);
eq('18%', {}, 0.18);
eq('200 * 18%', {}, 36);
eq('5x3', {}, 15);
eq('2 x 3', {}, 6);
eq('(NumberOfPeople x Cost x days) + AutoCharge + (oldPay) - (Cuttings)', { numberofpeople: 4, cost: 250, days: 3, autocharge: 500, oldpay: 1000, cuttings: 200 }, 4300);
eq('[Auto Charge] + [auto   charge]', { 'auto charge': 5 }, 10);
eq('Days * days', { days: 3 }, 9);
eq('x * 2', { x: 4 }, 8);
eq('x x 2', { x: 4 }, 8);
eq('max(1, 5, 3) + min(4, 2)', {}, 7);
eq('round(2.345, 2)', {}, 2.35);
eq('round(1.005, 2)', {}, 1.01);
eq('sqrt(16) + abs(-3)', {}, 7);
eq('if(a > 1000, a * 10%, 0)', { a: 2000 }, 200);
eq('if(a > 1000, a * 10%, 0)', { a: 20 }, 0);
eq('pi * r^2', { r: 1 }, Math.PI);
eq('1e3 + 1_000', {}, 2000);
eq('P * r/12/100 * (1 + r/12/100)^n / ((1 + r/12/100)^n - 1)', { p: 100000, r: 12, n: 12 }, 8884.878867834166);
eq('2 × 3 ÷ 4', {}, 1.5);
eq('pow(2, 10)', {}, 1024);
eq('avg(2, 4) + sum(1,2,3)', {}, 9);

bad('', /empty/);
bad('1 +', /ends with an operator/);
bad('(1 + 2', /closing/);
bad('1 + 2)', /Unmatched/);
bad('2 3', /Missing operator/);
bad('foo(2)', /Unknown function/);
bad('sqrt(1, 2)', /takes 1/);
bad('max()', /takes/);
bad('1 $ 2', /Unexpected character/);
bad('a b', /Missing operator/);
bad('1.2.3', /not a valid number/);
bad('* 2', /Expected a value/);

const p = parse('a / b');
assert.throws(() => evaluate(p.ast, { a: 1, b: 0 }), /Division by zero/); pass++;
assert.throws(() => evaluate(p.ast, { a: 1 }), /No value given/); pass++;

assert.deepEqual(parse('Price * Qty + price').variables, [{ key: 'price', name: 'Price' }, { key: 'qty', name: 'Qty' }]); pass++;
assert.equal(stringify(parse('(a + b) * c').ast), '(a + b) × c'); pass++;
assert.equal(stringify(parse('a - (b - c)').ast), 'a - (b - c)'); pass++;
assert.equal(stringify(parse('a * b').ast, { a: -2, b: 3 }), '(-2) × 3'); pass++;
assert.equal(stringify(parse('[Auto Charge] + 1').ast), '[Auto Charge] + 1'); pass++;
const e = parse('1 + foo(2)').error; assert.equal(e.pos, 4); pass++;

console.log(`engine: ${pass} tests passed`);
