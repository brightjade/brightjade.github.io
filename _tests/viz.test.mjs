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

function logic(file, names) {
  const html = readFileSync(new URL(`../viz/${file}`, import.meta.url), "utf8");
  const code = /<script id="logic">([\s\S]*?)<\/script>/.exec(html)[1];
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(code + `\n;globalThis.api = { ${names} };`, ctx);
  return ctx.api;
}

test("baseline keeps the mean and cuts variance", () => {
  const { estimates, stats } = logic("baseline-variance.html", "estimates, stats");
  const noB = stats(estimates(10, false, 4000, 7)), withB = stats(estimates(10, true, 4000, 7));
  assert.ok(Math.abs(noB.mean - withB.mean) < 0.15);       // 둘 다 같은 기댓값(불편)
  assert.ok(withB.variance < noB.variance / 5);            // 보상을 크게 밀면 baseline 없는 쪽 분산이 폭발
});

test("dpo loss and weight", () => {
  const { loss, weight } = logic("dpo-loss.html", "loss, weight");
  assert.ok(loss(-2) > loss(0) && loss(0) > loss(2));
  assert.ok(Math.abs(weight(0) - 0.5) < 1e-9);
  assert.ok(weight(5) < 0.01 && weight(-5) > 0.99);
});

test("grpo advantages", () => {
  const { advantages } = logic("grpo-advantage.html", "advantages");
  assert.deepEqual([...advantages([1, 1, 1, 1], true)], [0, 0, 0, 0]);   // 다 같으면 신호 없음
  const rare = advantages([1, 0, 0, 0, 0, 0, 0, 0], true)[0], half = advantages([1, 1, 1, 1, 0, 0, 0, 0], true)[0];
  assert.ok(rare > 2 * half);                                               // std로 나누면 드문 성공이 크게 부풀음
  const rareDr = advantages([1, 0, 0, 0, 0, 0, 0, 0], false)[0], halfDr = advantages([1, 1, 1, 1, 0, 0, 0, 0], false)[0];
  assert.ok(rareDr < 2 * halfDr);
  assert.ok(Math.abs(advantages([1, 0, 1, 0, 0], true).reduce((a, b) => a + b, 0)) < 1e-9);
});

test("pass@k curves cross", () => {
  const { passAtK, problems } = logic("passk.html", "passAtK, problems");
  const base = problems(0), rl = problems(0.8);
  assert.ok(passAtK(rl, 1) > passAtK(base, 1));
  assert.ok(passAtK(base, 256) > passAtK(rl, 256));
  assert.ok(passAtK(base, 8) > passAtK(base, 2));
});

test("refusal trade-off", () => {
  const { rates } = logic("refusal-tradeoff.html", "rates");
  const lo = rates(0.3, 1.5), hi = rates(0.7, 1.5);
  assert.ok(hi.overRefusal < lo.overRefusal);        // 임계값을 올리면 과잉 거절은 줄고
  assert.ok(hi.attackSuccess > lo.attackSuccess);    // 공격 성공은 늘어남
  const better = rates(0.5, 3), worse = rates(0.5, 1);
  assert.ok(better.overRefusal < worse.overRefusal && better.attackSuccess < worse.attackSuccess);
});

test("eval error bars", () => {
  const { halfWidth } = logic("eval-error-bars.html", "halfWidth");
  assert.ok(halfWidth(200, 1) > halfWidth(5000, 1));          // 문항이 많을수록 좁아짐
  assert.ok(halfWidth(1000, 10) > halfWidth(1000, 1));        // 같은 지문 문항 묶음(군집)은 넓힘
  assert.ok(halfWidth(200, 1) * 100 > 2);                     // 200문항에선 2점 차이가 오차 안
  assert.ok(halfWidth(10000, 1) * 100 < 2);
});

test("sqrt-d keeps softmax from saturating", () => {
  const { scores, softmax, std } = logic("sqrt-d.html", "scores, softmax, std");
  const raw = scores(1024, 16, 5, false), scaled = scores(1024, 16, 5, true);
  assert.ok(std(raw) > 15 && std(raw) < 50);            // ≈ √1024 = 32
  assert.ok(std(scaled) > 0.5 && std(scaled) < 1.6);     // ≈ 1
  assert.ok(Math.max(...softmax(raw)) > 0.9);            // 한 토큰에 쏠림
  assert.ok(Math.max(...softmax(scaled)) < 0.7);
});

test("rope dot depends only on relative position", () => {
  const { score } = logic("rope.html", "score");
  assert.ok(Math.abs(score(3, 1) - score(8, 6)) < 1e-9);
  assert.ok(Math.abs(score(3, 1) - score(3, 2)) > 1e-3);
});

test("chinchilla compute-optimal ratio", () => {
  const { optimum, loss } = logic("chinchilla.html", "optimum, loss");
  const o = optimum(1e23);
  assert.ok(o.D / o.N > 10 && o.D / o.N < 40);                 // 토큰/파라미터 ≈ 20
  assert.ok(loss(o.N / 4, (1e23 / 6) / (o.N / 4)) > o.L);        // 같은 compute에서 작은 모델은 loss가 약간 높음
  assert.ok(optimum(1e24).N > o.N);
});

test("decoding filters", () => {
  const { process } = logic("decoding.html", "process");
  const L = [3, 2.5, 2, 1, 0.5, 0, -0.5, -1];
  const sum = a => a.reduce((x, y) => x + y, 0);
  assert.ok(Math.abs(sum(process(L, 1, 8, 1)) - 1) < 1e-9);
  assert.ok(process(L, 0.05, 8, 1)[0] > 0.99);                   // T → 0이면 greedy
  assert.deepEqual([...process(L, 1, 1, 1)].map(x => Math.round(x)), [1, 0, 0, 0, 0, 0, 0, 0]);
  const p = process(L, 1, 8, 0.5);
  assert.ok(p.filter(x => x > 0).length < 8);                   // top-p가 꼬리를 자름
});

test("kv cache size", () => {
  const { kvBytes } = logic("kv-cache.html", "kvBytes");
  const gqa = kvBytes({ layers: 80, kvHeads: 8, headDim: 128, seq: 32768, batch: 1, bytes: 2, mode: "gqa" });
  assert.ok(Math.abs(gqa / 1e9 - 10.7) < 0.2);                   // 70B·GQA·32K·BF16 ≈ 10.7GB
  const mha = kvBytes({ layers: 80, kvHeads: 64, headDim: 128, seq: 32768, batch: 1, bytes: 2, mode: "mha" });
  assert.ok(Math.abs(mha / gqa - 8) < 1e-9);
  const mla = kvBytes({ layers: 80, kvHeads: 64, headDim: 128, seq: 32768, batch: 1, bytes: 2, mode: "mla" });
  assert.ok(mla < gqa);
});

test("speculative decoding speedup", () => {
  const { expectedTokens, speedup } = logic("spec-decoding.html", "expectedTokens, speedup");
  assert.ok(Math.abs(expectedTokens(0, 4) - 1) < 1e-9);
  assert.ok(Math.abs(expectedTokens(0.5, 1) - 1.5) < 1e-9);
  assert.ok(speedup(0.8, 4, 0.05) > speedup(0.5, 4, 0.05));
  assert.ok(speedup(0.8, 4, 0.05) > speedup(0.8, 30, 0.05));     // 너무 길게 추측하면 손해
});

test("training budget", () => {
  const { budget } = logic("train-budget.html", "budget");
  const b = budget(70e9, 15e12, 989e12, 0.4, 1024);
  assert.ok(Math.abs(b.flops - 6.3e24) / 6.3e24 < 1e-9);
  assert.ok(b.gpuDays > 1.7e5 && b.gpuDays < 2.0e5);
  assert.ok(Math.abs(b.memBytes - 1.12e12) < 1e9);               // 16 bytes/param
});
