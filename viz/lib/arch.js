// 아키텍처 그림 공용 렌더러. 케이스 파일은 <script id="arch" type="application/json">에 데이터만 두고 mountArch()를 부른다.
// 데이터: {lanes:[{id,label}], nodes:[{id,label,kind,lane,col}], edges:[{from,to,fail?,at?}], steps:[{cap,show:[node id]}]}
// kind: data · model · store · service · person. fail 화살표는 빨간 점선(실패 경로). at = 그 단계부터 보임(없으면 두 끝이 보이는 순간).

function checkArch(spec) {
  const out = [];
  const lanes = new Set(spec.lanes.map(l => l.id));
  const ids = new Set(), cells = new Set();
  for (const n of spec.nodes) {
    if (ids.has(n.id)) out.push(`노드 id 중복: ${n.id}`);
    ids.add(n.id);
    if (!lanes.has(n.lane)) out.push(`없는 줄: ${n.id} → ${n.lane}`);
    const cell = `${n.lane}/${n.col}`;
    if (cells.has(cell)) out.push(`같은 자리에 노드 둘: ${cell}`);
    cells.add(cell);
  }
  for (const e of spec.edges) for (const end of [e.from, e.to]) if (!ids.has(end)) out.push(`화살표 끝이 없는 노드: ${end}`);
  const shown = new Set();
  spec.steps.forEach((s, i) => s.show.forEach(id => {
    if (!ids.has(id)) out.push(`${i + 1}단계: 없는 노드 ${id}`);
    shown.add(id);
  }));
  for (const id of ids) if (!shown.has(id)) out.push(`어느 단계에도 안 나오는 노드: ${id}`);
  return out;
}

function visibleAt(spec, i) {
  const nodes = new Set();
  spec.steps.slice(0, i + 1).forEach(s => s.show.forEach(id => nodes.add(id)));
  const edges = new Set();
  spec.edges.forEach((e, k) => {
    if (nodes.has(e.from) && nodes.has(e.to) && (e.at === undefined || e.at <= i)) edges.add(k);
  });
  return { nodes, edges };
}

const ARCH_GEOM = { pad: 8, gap: 14, laneGap: 22, h: 46, label: 16 };

function place(spec, width) {
  const { pad, gap, laneGap, h, label } = ARCH_GEOM;
  const vertical = width < 480;
  const lanes = spec.lanes.map(l => l.id);
  const cols = Math.max(...spec.nodes.map(n => n.col)) + 1;
  const across = vertical ? lanes.length : cols;
  const w = (width - pad * 2 - gap * (across - 1)) / across;
  const box = {};
  for (const n of spec.nodes) {
    const li = lanes.indexOf(n.lane);
    box[n.id] = vertical
      ? { x: pad + li * (w + gap), y: pad + label + n.col * (h + laneGap), w, h }
      : { x: pad + n.col * (w + gap), y: pad + li * (label + h + laneGap) + label, w, h };
  }
  const height = vertical
    ? pad * 2 + label + cols * h + (cols - 1) * laneGap
    : pad * 2 + lanes.length * (label + h) + (lanes.length - 1) * laneGap;
  return { box, vertical, height };
}

function ends(a, b) {
  const ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by = b.y + b.h / 2;
  if (Math.abs(by - ay) < a.h / 2) return bx >= ax ? [a.x + a.w, ay, b.x, by] : [a.x, ay, b.x + b.w, by];
  return by > ay ? [ax, a.y + a.h, bx, b.y] : [ax, a.y, bx, b.y + b.h];
}

function archSvg(spec, i, width) {
  const { pad, gap, laneGap, h, label } = ARCH_GEOM;
  const { box, vertical, height } = place(spec, width);
  const vis = visibleAt(spec, i);
  const fresh = new Set(spec.steps[i].show);
  const color = { data: "var(--muted)", model: "var(--accent)", store: "var(--warn)", service: "var(--good)", person: "var(--fg)" };
  let s = `<svg viewBox="0 0 ${width} ${height}" width="100%" height="100%" preserveAspectRatio="xMidYMin meet" font-size="13"><defs>` +
    ["muted", "bad"].map(c => `<marker id="ah-${c}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="var(--${c})"/></marker>`).join("") +
    `</defs>`;
  const laneW = (width - pad * 2 + gap) / spec.lanes.length;
  spec.lanes.forEach((l, li) => {
    const x = vertical ? pad + li * laneW : pad;
    const y = vertical ? pad + 12 : pad + li * (label + h + laneGap) + 12;
    s += `<text x="${x}" y="${y}" fill="var(--muted)" font-size="12">${l.label}</text>`;
  });
  spec.edges.forEach((e, k) => {
    if (!vis.edges.has(k)) return;
    const [x1, y1, x2, y2] = ends(box[e.from], box[e.to]);
    const c = e.fail ? "bad" : "muted";
    s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--${c})" stroke-width="1.5"${e.fail ? ' stroke-dasharray="5 4"' : ""} marker-end="url(#ah-${c})"/>`;
  });
  for (const n of spec.nodes) {
    if (!vis.nodes.has(n.id)) continue;
    const b = box[n.id];
    s += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="8" fill="var(--bg)" stroke="${color[n.kind] || "var(--line)"}" stroke-width="${fresh.has(n.id) ? 2.5 : 1.2}"/>` +
      `<text x="${b.x + b.w / 2}" y="${b.y + b.h / 2 + 4}" text-anchor="middle" fill="var(--fg)">${n.label}</text>`;
  }
  return s + "</svg>";
}

function mountArch() {
  const spec = JSON.parse(document.getElementById("arch").textContent);
  const stage = document.getElementById("stage"), cap = document.getElementById("cap"), dots = document.getElementById("dots");
  dots.innerHTML = spec.steps.map(() => "<span></span>").join("");
  const s = makeStepper(spec.steps, i => {
    cap.innerHTML = `<b>${i + 1}/${spec.steps.length}</b> ${spec.steps[i].cap}`;
    stage.innerHTML = archSvg(spec, i, stage.clientWidth || 700);
    [...dots.children].forEach((d, j) => d.classList.toggle("on", j === i));
  });
  document.getElementById("prev").onclick = s.prev;
  document.getElementById("next").onclick = s.next;
  document.addEventListener("keydown", e => { if (e.key === "ArrowRight") s.next(); if (e.key === "ArrowLeft") s.prev(); });
  addEventListener("resize", () => s.go(s.index()));
  s.go(0);
}
