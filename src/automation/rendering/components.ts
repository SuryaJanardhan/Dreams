import type { PrimitiveSpec, SemanticColor, VisualObject } from "../domain.js";

const colors: Record<SemanticColor, string> = {
  structure: "#151515",
  active: "#2878d0",
  success: "#3f8f62",
  warning: "#e7c536",
  failure: "#cf4e46",
};
function escape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function hash(value: string) {
  let result = 2166136261;
  for (const character of value) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}
function jitter(seed: number, index: number, amount = 1.4) {
  const value = Math.sin((seed + index * 91.17) * 12.9898) * 43758.5453;
  return (value - Math.floor(value) - 0.5) * amount;
}
function organicRect(id: string, inset = 7) {
  const seed = hash(id);
  const left = inset + jitter(seed, 1);
  const top = inset + jitter(seed, 2);
  const right = 100 - inset + jitter(seed, 3);
  const bottom = 70 - inset + jitter(seed, 4);
  return [
    `M ${left + 8} ${top}`,
    `C ${left + 35} ${top + jitter(seed, 5)} ${right - 30} ${top + jitter(seed, 6)} ${right - 8} ${top}`,
    `Q ${right} ${top} ${right} ${top + 8}`,
    `C ${right + jitter(seed, 7)} ${top + 28} ${right + jitter(seed, 8)} ${bottom - 20} ${right} ${bottom - 8}`,
    `Q ${right} ${bottom} ${right - 8} ${bottom}`,
    `C ${right - 32} ${bottom + jitter(seed, 9)} ${left + 28} ${bottom + jitter(seed, 10)} ${left + 8} ${bottom}`,
    `Q ${left} ${bottom} ${left} ${bottom - 8}`,
    `C ${left + jitter(seed, 11)} ${bottom - 25} ${left + jitter(seed, 12)} ${top + 25} ${left} ${top + 8}`,
    `Q ${left} ${top} ${left + 8} ${top} Z`,
  ].join(" ");
}
function label(object: VisualObject) {
  return `<div class="object-label">${escape(object.label)}</div>${
    object.detail
      ? `<div class="object-detail">${escape(object.detail)}</div>`
      : ""
  }`;
}
function shell(object: VisualObject, body: string, extraClass = "") {
  return `<div class="object kind-${object.kind} ${extraClass}" data-object-id="${escape(object.id)}" data-semantic="${object.semantic}" style="left:${object.box.x}px;top:${object.box.y}px;width:${object.box.width}px;height:${object.box.height}px;--accent:${colors[object.semantic]}">${body}</div>`;
}
function illustrated(object: VisualObject, inner: string) {
  return shell(
    object,
    `<svg class="illustration" viewBox="0 0 100 70" aria-hidden="true"><path class="paper-fill organic-outline" d="${organicRect(object.id)}"/>${inner}</svg>${label(object)}`,
  );
}
function table(object: VisualObject) {
  const rows = (object.rows ?? [])
    .map(
      (cells, row) =>
        `<div class="table-row" data-row="${row}">${cells
          .map((cell) => `<span>${escape(cell)}</span>`)
          .join("")}</div>`,
    )
    .join("");
  return shell(
    object,
    `<div class="designed-card table-card"><div class="card-heading">${escape(object.label)}</div>${rows}</div>`,
  );
}
function codeCard(object: VisualObject) {
  const lines = (object.detail ?? "")
    .split("\n")
    .slice(0, 7)
    .map(
      (line, index) =>
        `<div class="code-line" data-line="${index}"><span>${String(index + 1).padStart(2, "0")}</span>${escape(line)}</div>`,
    )
    .join("");
  return shell(
    object,
    `<div class="designed-card code-card"><div class="card-heading">${escape(object.label)}</div><div class="code-lines">${lines}</div></div>`,
  );
}
function image(object: VisualObject, images: Record<string, string>) {
  const source = object.assetId ? images[object.assetId] : undefined;
  if (!source) throw new Error(`Validated image missing for ${object.id}`);
  return shell(
    object,
    `<div class="image-frame"><div class="browser-dots">● ● ●</div><img src="${escape(source)}" alt="${escape(object.label)}"/></div>${label(object)}`,
  );
}
function composite(object: VisualObject, primitive?: PrimitiveSpec) {
  if (!primitive) throw new Error(`Primitive missing for ${object.id}`);
  const shapes = primitive.shapes
    .map((shape) => {
      const color = colors[shape.semantic];
      switch (shape.kind) {
        case "rect":
          return `<rect x="${shape.x}" y="${shape.y}" width="${shape.width ?? 10}" height="${shape.height ?? 10}" rx="4" fill="none" stroke="${color}" stroke-width="3"/>`;
        case "circle":
          return `<circle cx="${shape.x}" cy="${shape.y}" r="${(shape.width ?? 10) / 2}" fill="none" stroke="${color}" stroke-width="3"/>`;
        case "line":
          return `<line x1="${shape.x}" y1="${shape.y}" x2="${shape.x + (shape.width ?? 10)}" y2="${shape.y + (shape.height ?? 0)}" stroke="${color}" stroke-width="3" stroke-linecap="round"/>`;
        case "path":
          return `<path d="${escape(shape.text ?? "")}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
        case "text":
          return `<text x="${shape.x}" y="${shape.y}" fill="${color}" font-size="9" font-weight="700">${escape(shape.text ?? "")}</text>`;
      }
    })
    .join("");
  return shell(
    object,
    `<svg class="illustration" viewBox="0 0 100 100">${shapes}</svg>${label(object)}`,
  );
}

export function renderObject(
  object: VisualObject,
  primitives: PrimitiveSpec[],
  images: Record<string, string>,
) {
  switch (object.kind) {
    case "code-card":
      return codeCard(object);
    case "table":
      return table(object);
    case "image":
      return image(object, images);
    case "composite":
      return composite(
        object,
        primitives.find((item) => item.id === object.primitiveId),
      );
    case "database":
      return illustrated(
        object,
        `<ellipse class="semantic-fill ink" cx="50" cy="19" rx="28" ry="10"/><path class="ink no-fill" d="M22 19v31c0 7 13 11 28 11s28-4 28-11V19"/><path class="ink no-fill" d="M22 34c0 7 13 11 28 11s28-4 28-11"/><g class="database-row"><path class="accent-line" d="M34 50h32"/></g>`,
      );
    case "queue":
      return illustrated(
        object,
        `<path class="ink no-fill" d="M18 36h64"/>${[0, 1, 2, 3]
          .map(
            (index) =>
              `<circle class="queue-dot semantic-fill ink" data-queue-index="${index}" cx="${28 + index * 15}" cy="36" r="6"/>`,
          )
          .join("")}`,
      );
    case "browser":
      return illustrated(
        object,
        `<path class="ink no-fill" d="M15 24h70"/><circle class="semantic-fill" cx="22" cy="17" r="2.4"/><circle class="warning-fill" cx="30" cy="17" r="2.4"/><path class="accent-line" d="M25 39h50M25 48h32"/>`,
      );
    case "client":
      return illustrated(
        object,
        `<rect class="semantic-fill ink" x="20" y="14" width="60" height="37" rx="5"/><path class="ink no-fill" d="M43 52v7M57 52v7M34 60h32"/><circle class="accent-fill" cx="50" cy="33" r="7"/>`,
      );
    case "service":
    case "cloud":
      return illustrated(
        object,
        `<path class="semantic-fill ink" d="M27 50h47c10 0 13-14 4-19-2-12-18-16-26-7-10-7-24 0-22 12-10 2-12 14-3 14Z"/><path class="accent-line" d="M39 39h22"/>`,
      );
    case "server":
      return illustrated(
        object,
        `<rect class="semantic-fill ink" x="24" y="12" width="52" height="48" rx="7"/><path class="ink no-fill" d="M31 25h29M31 36h29M31 47h29"/><circle class="accent-fill service-light" cx="68" cy="25" r="3"/><circle class="warning-fill ink" cx="68" cy="36" r="3"/>`,
      );
    case "server-cluster":
      return illustrated(
        object,
        `<rect class="semantic-fill ink" x="13" y="18" width="31" height="39" rx="5"/><rect class="semantic-fill ink" x="56" y="18" width="31" height="39" rx="5"/><path class="ink no-fill" d="M19 29h14M19 40h14M62 29h14M62 40h14M44 38h12"/><circle class="accent-fill" cx="36" cy="29" r="2.5"/><circle class="accent-fill" cx="79" cy="29" r="2.5"/>`,
      );
    case "cache":
      return illustrated(
        object,
        `<rect class="semantic-fill ink" x="22" y="17" width="56" height="40" rx="8"/><path class="ink no-fill" d="M31 29h38M31 39h27"/><path class="accent-line" d="M25 12v6M38 12v6M51 12v6M64 12v6M77 12v6M25 57v6M38 57v6M51 57v6M64 57v6M77 57v6"/>`,
      );
    case "load-balancer":
      return illustrated(
        object,
        `<path class="semantic-fill ink" d="m50 15 20 20-20 20-20-20Z"/><path class="ink no-fill" d="M8 35h22M70 35h14M70 35l14-14M70 35l14 14"/><circle class="accent-fill" cx="50" cy="35" r="5"/>`,
      );
    case "token":
      return illustrated(
        object,
        `<rect class="semantic-fill ink" x="18" y="20" width="64" height="31" rx="8"/><circle class="accent-fill" cx="34" cy="35" r="7"/><path class="ink no-fill" d="M47 31h25M47 40h17"/>`,
      );
    case "repository":
      return illustrated(
        object,
        `<path class="ink no-fill" d="M32 17v35M32 28h29v15"/><circle class="semantic-fill ink" cx="32" cy="17" r="6"/><circle class="semantic-fill ink" cx="32" cy="53" r="6"/><circle class="accent-fill" cx="61" cy="44" r="6"/>`,
      );
    case "pipeline":
      return illustrated(
        object,
        `<path class="accent-line" d="M19 36h62"/>${[22, 41, 60, 79]
          .map(
            (x, index) =>
              `<circle class="${index === 3 ? "accent-fill" : "semantic-fill ink"}" cx="${x}" cy="36" r="7"/>`,
          )
          .join("")}`,
      );
    case "container":
      return illustrated(
        object,
        `<rect class="semantic-fill ink" x="17" y="17" width="66" height="40" rx="6"/><path class="ink no-fill" d="M29 17v40M42 17v40M55 17v40M68 17v40"/>`,
      );
    case "virtual-machine":
      return illustrated(
        object,
        `<rect class="semantic-fill ink" x="15" y="13" width="70" height="47" rx="8"/><rect class="paper-fill ink" x="27" y="24" width="46" height="25" rx="4"/><circle class="accent-fill" cx="77" cy="20" r="3"/>`,
      );
    case "terminal":
      return illustrated(
        object,
        `<rect class="semantic-fill ink" x="13" y="15" width="74" height="45" rx="7"/><path class="accent-line" d="m24 31 8 6-8 6M39 44h21"/>`,
      );
    case "phone":
      return illustrated(
        object,
        `<rect class="semantic-fill ink" x="34" y="8" width="32" height="55" rx="8"/><path class="ink no-fill" d="M43 14h14"/><circle class="accent-fill" cx="50" cy="56" r="3"/>`,
      );
    case "decision":
      return illustrated(
        object,
        `<path class="semantic-fill ink" d="m50 12 29 23-29 23-29-23Z"/><path class="accent-line" d="M43 27c1-8 14-8 14 0 0 6-7 6-7 12M50 47h.1"/>`,
      );
    case "api":
      return illustrated(
        object,
        `<path class="semantic-fill ink" d="M35 20h30l10 16-10 16H35L25 36Z"/><path class="ink no-fill" d="M8 36h17M75 36h17"/><circle class="accent-fill" cx="50" cy="36" r="6"/>`,
      );
    case "lock":
      return illustrated(
        object,
        `<path class="ink no-fill lock-shackle" d="M35 32V24c0-20 30-20 30 0v8"/><rect class="semantic-fill ink" x="27" y="31" width="46" height="29" rx="8"/><circle class="accent-fill" cx="50" cy="44" r="4"/><path class="accent-line" d="M50 48v6"/>`,
      );
    case "file":
      return illustrated(
        object,
        `<path class="semantic-fill ink" d="M30 10h28l14 14v38H30Z"/><path class="ink no-fill" d="M58 10v15h14M39 37h24M39 46h24"/>`,
      );
    case "badge":
      return illustrated(
        object,
        `<circle class="semantic-fill ink" cx="50" cy="35" r="24"/><path class="accent-line" d="m38 35 8 8 17-19"/>`,
      );
    case "counter":
      return illustrated(
        object,
        `<path class="ink no-fill" d="M25 52a27 27 0 1 1 50 0"/><path class="accent-line counter-needle" d="M50 50 67 28"/><circle class="accent-fill" cx="50" cy="50" r="4"/>`,
      );
    case "label":
      return shell(
        object,
        `<div class="free-label">${escape(object.label)}</div>`,
      );
    default:
      return illustrated(
        object,
        `<rect class="semantic-fill ink" x="20" y="18" width="60" height="36" rx="8"/><circle class="accent-fill service-light" cx="70" cy="26" r="4"/><path class="ink no-fill" d="M30 32h30M30 42h38"/>`,
      );
  }
}
