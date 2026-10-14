import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../yt.html", import.meta.url), "utf8");
const code = /<script id="logic">([\s\S]*?)<\/script>/.exec(html)[1];
const ctx = { URLSearchParams };   // vm 컨텍스트엔 URLSearchParams가 없음
vm.createContext(ctx);
vm.runInContext(code + "\n;globalThis.api = { seconds, embedSrc };", ctx);
const { seconds, embedSrc } = ctx.api;

test("seconds parses plain and h/m/s forms", () => {
  assert.equal(seconds("90"), 90);
  assert.equal(seconds("1m30s"), 90);
  assert.equal(seconds(""), 0);
});

test("embedSrc adds start and end", () => {
  const src = embedSrc(new URLSearchParams("v=aaaaaaaaaaa&t=252&e=690"));
  assert.match(src, /^https:\/\/www\.youtube\.com\/embed\/aaaaaaaaaaa\?/);
  assert.match(src, /[?&]start=252(&|$)/);
  assert.match(src, /[?&]end=690(&|$)/);
});

test("end before start is ignored", () => {
  const src = embedSrc(new URLSearchParams("v=aaaaaaaaaaa&t=300&e=100"));
  assert.doesNotMatch(src, /end=/);
});

test("invalid id gives null", () => {
  assert.equal(embedSrc(new URLSearchParams("v=bad")), null);
});
