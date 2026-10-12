import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../fashion-weather.html", import.meta.url), "utf8");
const code = /<script id="logic">([\s\S]*?)<\/script>/.exec(html)[1];
const ctx = {};
vm.createContext(ctx);
vm.runInContext(code + "\n;globalThis.api = { BANDS, bandOf, skyOf, summarize, fixture, toF, both, bothRange };", ctx);
const { BANDS, bandOf, skyOf, summarize, fixture, toF, both, bothRange } = ctx.api;

test("band names match closet-sync TEMPS exactly", () => {
  assert.deepEqual([...BANDS.map(b => b.name)],
    ["28°C↑ (82°F↑)", "23–27°C (73–81°F)", "20–22°C (68–72°F)", "17–19°C (63–66°F)", "12–16°C (54–61°F)", "9–11°C (48–52°F)", "5–8°C (41–46°F)", "4°C↓ (39°F↓)"]);
});

test("boundaries round to the nearest degree", () => {
  const cases = [[4.4, "4°C↓ (39°F↓)"], [4.5, "5–8°C (41–46°F)"], [8, "5–8°C (41–46°F)"], [8.6, "9–11°C (48–52°F)"], [11, "9–11°C (48–52°F)"], [12, "12–16°C (54–61°F)"],
    [16.4, "12–16°C (54–61°F)"], [17, "17–19°C (63–66°F)"], [19, "17–19°C (63–66°F)"], [20, "20–22°C (68–72°F)"], [22, "20–22°C (68–72°F)"], [23, "23–27°C (73–81°F)"],
    [27, "23–27°C (73–81°F)"], [27.5, "28°C↑ (82°F↑)"], [-8, "4°C↓ (39°F↓)"]];
  for (const [t, name] of cases) assert.equal(bandOf(t).name, name, String(t));
});

test("summary: day band, swing, umbrella", () => {
  const s = summarize(fixture(new URLSearchParams("t=14&feel=12&min=9&max=19&rain=60")));
  assert.equal(s.band.name, "12–16°C (54–61°F)");
  assert.deepEqual([...s.hints], ["낮엔 17–19°C (63–66°F)", "벗기 쉬운 겉옷", "우산"]);
  assert.equal(s.min, 9);
  assert.equal(s.max, 19);
});

test("summary: no hints on a flat dry day", () => {
  const s = summarize(fixture(new URLSearchParams("t=14&min=12&max=16&rain=10")));
  assert.deepEqual([...s.hints], []);
});

test("summary ignores hours outside 9–21 and other days", () => {
  const d = { current: { time: "2026-10-12T07:00", temperature_2m: 10, apparent_temperature: 10, weather_code: 0 },
    hourly: { time: ["2026-10-12T06:00", "2026-10-12T12:00", "2026-10-12T22:00", "2026-10-13T12:00"],
      temperature_2m: [2, 15, 3, 25], precipitation_probability: [90, 0, 90, 90] } };
  const s = summarize(d);
  assert.equal(s.min, 15);
  assert.equal(s.max, 15);
  assert.equal(s.rain, 0);
});

test("sky text", () => {
  assert.equal(skyOf(0), "맑음");
  assert.equal(skyOf(63), "비");
  assert.equal(skyOf(3), "흐림");
});

test("celsius with fahrenheit", () => {
  assert.equal(toF(14), 57);
  assert.equal(toF(-3), 27);
  assert.equal(both(14.4), "14°C (58°F)");
  assert.equal(bothRange(9.2, 18.6), "9–19°C (49–65°F)");
});
