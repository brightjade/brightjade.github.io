import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function load(path, names) {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL(path, import.meta.url), "utf8") + `\n;globalThis.api = { ${names} };`, ctx);
  return ctx.api;
}

test("stepper clamps and reports", () => {
  const { makeStepper } = load("../viz/lib/stepper.js", "makeStepper");
  const seen = [];
  const s = makeStepper(["a", "b", "c"], i => seen.push(i));
  s.prev(); s.next(); s.next(); s.next(); s.go(-5); s.go(1);
  assert.deepEqual(seen, [0, 1, 2, 2, 0, 1]);
  assert.equal(s.index(), 1);
});

test("reward over-optimization model", () => {
  const html = readFileSync(new URL("../viz/reward-overopt.html", import.meta.url), "utf8");
  const code = /<script id="logic">([\s\S]*?)<\/script>/.exec(html)[1];
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(code + "\n;globalThis.api = { gold, proxy, stopAt, goldPeak };", ctx);
  const { gold, proxy, stopAt, goldPeak } = ctx.api;
  assert.ok(proxy(2) > proxy(1));                      // proxy는 계속 오름
  const peak = goldPeak();
  assert.ok(gold(peak) > gold(peak * 0.5) && gold(peak) > gold(peak * 2));   // gold는 봉우리
  assert.ok(stopAt(0.5) < stopAt(0.05));               // KL 계수가 작을수록 멀리 감
});

test("context budget model", () => {
  const html = readFileSync(new URL("../viz/context-budget.html", import.meta.url), "utf8");
  const code = /<script id="logic">([\s\S]*?)<\/script>/.exec(html)[1];
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(code + "\n;globalThis.api = { simulate, WINDOW };", ctx);
  const { simulate, WINDOW } = ctx.api;
  const naive = simulate("naive", 40), compact = simulate("compact", 40), sub = simulate("subagent", 40);
  assert.ok(naive.at(-1) >= WINDOW);                       // 그대로 쌓으면 창을 넘침
  assert.ok(Math.max(...compact) < WINDOW);                // 압축하면 창 안에 머묾
  assert.ok(sub.at(-1) < compact.at(-1) || Math.max(...sub) < Math.max(...compact));
  assert.equal(naive.length, 41);                          // 0단계 포함
});
