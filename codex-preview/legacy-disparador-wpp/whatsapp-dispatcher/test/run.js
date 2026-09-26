'use strict';

const assert = require('assert');
const { buildCandidates, isPlausibleBrazilianNumber } = require('../src/phone');
const { resolveSpintax, fillPlaceholders, buildMessage } = require('../src/spintax');
const { isValidHumanName } = require('../src/nameValidator');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`FAIL - ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

// ---------- phone.js ----------

test('numero com 9 digitos e DDI vira candidato exato + variante sem 9', () => {
  const candidates = buildCandidates('+55 (11) 98888-7777');
  assert.ok(candidates.includes('5511988887777'));
  assert.ok(candidates.includes('551188887777'));
});

test('numero sem DDI assume Brasil (55)', () => {
  const candidates = buildCandidates('11988887777');
  assert.ok(candidates.includes('5511988887777'));
});

test('numero com 8 digitos comecando em 6-9 ganha variante com 9', () => {
  const candidates = buildCandidates('1188887777');
  assert.ok(candidates.includes('551188887777'));
  assert.ok(candidates.includes('5511988887777'));
});

test('texto invalido nao gera candidato', () => {
  assert.strictEqual(isPlausibleBrazilianNumber('abc'), false);
  assert.strictEqual(isPlausibleBrazilianNumber('123'), false);
});

// ---------- spintax.js ----------

test('fillPlaceholders substitui variaveis conhecidas', () => {
  const out = fillPlaceholders('Oi {{nome}}, sobre {{empreendimento}}', {
    nome: 'Maria',
    empreendimento: 'Vista Verde',
  });
  assert.strictEqual(out, 'Oi Maria, sobre Vista Verde');
});

test('fillPlaceholders remove variavel vazia sem quebrar', () => {
  const out = fillPlaceholders('Oi {{nome}}, {{empreendimento}}!', { nome: 'Joao', empreendimento: '' });
  assert.strictEqual(out, 'Oi Joao, !');
});

test('resolveSpintax sempre escolhe uma das opcoes', () => {
  for (let i = 0; i < 20; i++) {
    const out = resolveSpintax('{a|b|c}');
    assert.ok(['a', 'b', 'c'].includes(out));
  }
});

test('buildMessage combina placeholders e spintax e limpa espacos', () => {
  const template = 'Oi {{nome}}, {tudo bem?|como vai?}  {{empreendimento}}';
  const out = buildMessage(template, { nome: 'Ana', empreendimento: '' });
  assert.ok(out.startsWith('Oi Ana,'));
  assert.ok(!out.includes('  '));
});

test('buildMessage limpa virgula solta quando nome fica vazio', () => {
  const out = buildMessage('Ola {{nome}}, tudo bem?', { nome: 'ignorado', empreendimento: '' }, '');
  assert.strictEqual(out, 'Ola, tudo bem?');
});

// ---------- nameValidator.js ----------

test('nomes plausiveis sao aceitos', () => {
  assert.strictEqual(isValidHumanName('Maria Silva'), true);
  assert.strictEqual(isValidHumanName('João'), true);
  assert.strictEqual(isValidHumanName("D'Ávila"), true);
});

test('numeros, placeholders e lixo sao rejeitados', () => {
  assert.strictEqual(isValidHumanName('11988887777'), false);
  assert.strictEqual(isValidHumanName('cliente'), false);
  assert.strictEqual(isValidHumanName('N/A'), false);
  assert.strictEqual(isValidHumanName(''), false);
  assert.strictEqual(isValidHumanName('xyzxyz'), false);
  assert.strictEqual(isValidHumanName('aaaaaa'), false);
  assert.strictEqual(isValidHumanName('teste@teste.com'), false);
});

console.log(`\n${passed} teste(s) passaram.`);
