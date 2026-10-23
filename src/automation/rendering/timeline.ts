import type {
  CaptionTrack,
  CameraAction,
  MotionPreset,
  SemanticColor,
  TimelineAction,
  VisualBox,
  VisualPlan,
} from "../domain.js";

export interface CompiledAction extends TimelineAction {
  at: number;
  end: number;
  fromLayout: Array<{ objectId: string; box: VisualBox }>;
}
export interface CompiledCameraAction extends CameraAction {
  at: number;
  end: number;
}
export interface CompiledTimeline {
  actions: CompiledAction[];
  camera: CompiledCameraAction[];
}
export interface ObjectFrameState {
  id: string;
  visible: boolean;
  opacity: number;
  scale: number;
  focus: number;
  box: VisualBox;
  semantic: SemanticColor;
  accent: string;
  detail?: string | undefined;
  internal?:
    | {
        action: TimelineAction["action"];
        progress: number;
        value?: string | undefined;
      }
    | undefined;
}
export interface ConnectorFrameState {
  id: string;
  action: "draw" | "transfer" | "branch";
  from: string;
  to: string;
  progress: number;
  packetProgress?: number | undefined;
  control1?: { x: number; y: number } | undefined;
  control2?: { x: number; y: number } | undefined;
}
export interface FrameState {
  objects: ObjectFrameState[];
  connectors: ConnectorFrameState[];
  camera: { x: number; y: number; scale: number };
}

function tokens(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}
function anchorTiming(beatId: string, anchorText: string, track: CaptionTrack) {
  const beat = track.beats.find((item) => item.id === beatId);
  if (!beat) throw new Error(`Missing timed beat ${beatId}`);
  const words = track.words.filter(
    (word) => word.start >= beat.start && word.start < beat.end,
  );
  const normalized = words.map((word) => tokens(word.text)[0] ?? "");
  const anchor = tokens(anchorText);
  let found = -1;
  for (let start = 0; start <= normalized.length - anchor.length; start++)
    if (anchor.every((word, offset) => normalized[start + offset] === word)) {
      found = start;
      break;
    }
  const first = words[found];
  const last = words[found + anchor.length - 1];
  if (found < 0 || !first || !last)
    throw new Error(
      `Could not align visual anchor ${JSON.stringify(anchorText)} in ${beat.id}`,
    );
  return { beat, first, last };
}
function duration(preset: MotionPreset) {
  switch (preset) {
    case "soft-enter":
      return 0.7;
    case "draw-path":
      return 0.9;
    case "travel-path":
      return 1.1;
    case "state-change":
      return 0.65;
    case "internal-action":
      return 0.9;
    case "rearrange":
      return 1.1;
    case "focus":
      return 0.55;
    case "settle":
      return 0.5;
    case "soft-exit":
      return 0.55;
  }
}
export function compileTimeline(
  plan: VisualPlan,
  track: CaptionTrack,
): CompiledTimeline {
  const layout = new Map(plan.world.map((object) => [object.id, object.box]));
  const actions = plan.timeline.map((action) => {
    const timing = anchorTiming(action.beatId, action.anchor, track);
    if (timing.first.start - timing.beat.start > 1.5)
      throw new Error(`Beat ${action.beatId} remains visually idle too long`);
    const fromLayout = (action.layout ?? []).flatMap((placement) => {
      const box = layout.get(placement.objectId);
      return box ? [{ objectId: placement.objectId, box }] : [];
    });
    for (const placement of action.layout ?? [])
      layout.set(placement.objectId, placement.box);
    return {
      ...action,
      at: timing.first.start,
      end: Math.min(
        timing.beat.end,
        Math.max(timing.last.end, timing.first.start + duration(action.motion)),
      ),
      fromLayout,
    };
  });
  const camera = plan.camera.map((action) => {
    const timing = anchorTiming(action.beatId, action.anchor, track);
    return {
      ...action,
      at: timing.first.start,
      end: Math.min(
        timing.beat.end,
        Math.max(timing.last.end, timing.first.start + 1),
      ),
    };
  });
  const sortedCamera = camera.sort((a, b) => a.at - b.at);
  for (let index = 1; index < sortedCamera.length; index++) {
    const previous = sortedCamera[index - 1];
    const current = sortedCamera[index];
    if (previous && current && current.at < previous.end)
      throw new Error(
        `Camera actions ${previous.id} and ${current.id} overlap`,
      );
  }
  return {
    actions: actions.sort((a, b) => a.at - b.at),
    camera: sortedCamera,
  };
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}
function ease(preset: MotionPreset, value: number) {
  const t = clamp(value);
  switch (preset) {
    case "soft-enter": {
      const back = 1.15;
      const shifted = t - 1;
      return clamp(1 + (back + 1) * shifted ** 3 + back * shifted ** 2);
    }
    case "draw-path":
    case "travel-path":
    case "rearrange":
      return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
    case "state-change":
    case "internal-action":
    case "focus":
    case "soft-exit":
      return 1 - (1 - t) ** 3;
    case "settle":
      return Math.sin((t * Math.PI) / 2);
  }
}
function interpolate(start: number, end: number, progress: number) {
  return start + (end - start) * progress;
}
const semanticColors: Record<SemanticColor, string> = {
  structure: "#151515",
  active: "#2878d0",
  success: "#3f8f62",
  warning: "#e7c536",
  failure: "#cf4e46",
};
function blendColor(start: string, end: string, progress: number) {
  const channel = (value: string, offset: number) =>
    Number.parseInt(value.slice(offset, offset + 2), 16);
  const result = [1, 3, 5].map((offset) =>
    Math.round(
      interpolate(channel(start, offset), channel(end, offset), progress),
    )
      .toString(16)
      .padStart(2, "0"),
  );
  return `#${result.join("")}`;
}
function boxBetween(start: VisualBox, end: VisualBox, progress: number) {
  return {
    x: interpolate(start.x, end.x, progress),
    y: interpolate(start.y, end.y, progress),
    width: interpolate(start.width, end.width, progress),
    height: interpolate(start.height, end.height, progress),
  };
}

function targetCamera(
  action: CompiledCameraAction,
  states: Map<string, ObjectFrameState>,
) {
  if (action.action === "return-wide") return { x: 0, y: 0, scale: 1 };
  const boxes = action.objectIds.flatMap((id) => {
    const state = states.get(id);
    return state ? [state.box] : [];
  });
  if (!boxes.length) return { x: 0, y: 0, scale: 1 };
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;
  const scale = action.zoom;
  return {
    x: 450 - centerX * scale,
    y: 625 - centerY * scale,
    scale,
  };
}
function routeConnector(
  connector: ConnectorFrameState,
  states: Map<string, ObjectFrameState>,
) {
  const from = states.get(connector.from);
  const to = states.get(connector.to);
  if (!from || !to) return connector;
  const start = {
    x: from.box.x + from.box.width / 2,
    y: from.box.y + from.box.height / 2,
  };
  const end = {
    x: to.box.x + to.box.width / 2,
    y: to.box.y + to.box.height / 2,
  };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const candidates = [
    {
      control1: { x: start.x + dx * 0.42, y: start.y },
      control2: { x: end.x - dx * 0.42, y: end.y },
    },
    {
      control1: { x: start.x, y: start.y + dy * 0.42 },
      control2: { x: end.x, y: end.y - dy * 0.42 },
    },
    {
      control1: { x: start.x, y: Math.min(start.y, end.y) - 75 },
      control2: { x: end.x, y: Math.min(start.y, end.y) - 75 },
    },
  ];
  const obstacles = [...states.values()].filter(
    (state) =>
      state.visible && state.id !== connector.from && state.id !== connector.to,
  );
  const collisionScore = (candidate: (typeof candidates)[number]) => {
    let collisions = 0;
    for (let step = 1; step < 10; step++) {
      const t = step / 10;
      const inverse = 1 - t;
      const x =
        inverse ** 3 * start.x +
        3 * inverse ** 2 * t * candidate.control1.x +
        3 * inverse * t ** 2 * candidate.control2.x +
        t ** 3 * end.x;
      const y =
        inverse ** 3 * start.y +
        3 * inverse ** 2 * t * candidate.control1.y +
        3 * inverse * t ** 2 * candidate.control2.y +
        t ** 3 * end.y;
      if (
        obstacles.some(
          (state) =>
            x > state.box.x - 10 &&
            x < state.box.x + state.box.width + 10 &&
            y > state.box.y - 10 &&
            y < state.box.y + state.box.height + 10,
        )
      )
        collisions++;
    }
    return collisions;
  };
  const selected = candidates
    .map((candidate) => ({ candidate, score: collisionScore(candidate) }))
    .sort((first, second) => first.score - second.score)[0]?.candidate;
  return selected ? { ...connector, ...selected } : connector;
}

export function evaluateTimelineAt(
  plan: VisualPlan,
  compiled: CompiledTimeline,
  time: number,
): FrameState {
  const states = new Map<string, ObjectFrameState>(
    plan.world.map((object) => [
      object.id,
      {
        id: object.id,
        visible: false,
        opacity: 0,
        scale: 0.96,
        focus: 0,
        box: object.box,
        semantic: object.semantic,
        accent: semanticColors[object.semantic],
        ...(object.detail === undefined ? {} : { detail: object.detail }),
      },
    ]),
  );
  const connectors: ConnectorFrameState[] = [];
  for (const action of compiled.actions) {
    if (time < action.at) continue;
    const raw = (time - action.at) / Math.max(0.001, action.end - action.at);
    const progress = ease(action.motion, raw);
    const targets = action.objectIds.flatMap((id) => {
      const state = states.get(id);
      return state ? [state] : [];
    });
    if (["create", "reveal", "draw"].includes(action.action))
      for (const state of targets) {
        state.visible = true;
        state.opacity = Math.max(state.opacity, progress);
        state.scale = interpolate(0.96, 1, progress);
      }
    if (action.action === "remove")
      for (const state of targets) {
        state.opacity = 1 - progress;
        state.scale = interpolate(1, 0.96, progress);
        if (raw >= 1) state.visible = false;
      }
    if (["focus", "compare"].includes(action.action)) {
      for (const state of states.values())
        if (state.visible && !action.objectIds.includes(state.id))
          state.focus = interpolate(state.focus, 0, progress);
      for (const state of targets) state.focus = progress;
    }
    if (action.action === "dim")
      for (const state of targets)
        state.opacity = Math.min(state.opacity, 1 - 0.65 * progress);
    if (action.action === "fail")
      for (const state of targets) {
        state.accent = blendColor(
          state.accent,
          semanticColors.failure,
          progress,
        );
        if (progress >= 1) state.semantic = "failure";
      }
    if (action.action === "succeed")
      for (const state of targets) {
        state.accent = blendColor(
          state.accent,
          semanticColors.success,
          progress,
        );
        if (progress >= 1) state.semantic = "success";
      }
    if (action.action === "mutate" && action.value)
      for (const state of targets) state.detail = action.value;
    if (action.action === "reflow" && action.layout)
      for (const placement of action.layout) {
        const state = states.get(placement.objectId);
        const start = action.fromLayout.find(
          (item) => item.objectId === placement.objectId,
        )?.box;
        if (state && start)
          state.box = boxBetween(start, placement.box, progress);
      }
    if (
      [
        "row-insert",
        "queue-advance",
        "lock",
        "unlock",
        "highlight-code",
        "expire",
        "annotate",
        "settle",
      ].includes(action.action)
    )
      for (const state of targets)
        state.internal = {
          action: action.action,
          progress,
          ...(action.value === undefined ? {} : { value: action.value }),
        };
    if (
      ["draw", "transfer", "branch"].includes(action.action) &&
      action.objectIds.length >= 2
    )
      for (let index = 1; index < action.objectIds.length; index++) {
        const from =
          action.objectIds[action.action === "branch" ? 0 : index - 1];
        const to = action.objectIds[index];
        if (!from || !to) continue;
        connectors.push({
          id: `${action.id}-${index}`,
          action: action.action as ConnectorFrameState["action"],
          from,
          to,
          progress,
          ...(action.action === "transfer"
            ? { packetProgress: raw < 1 ? progress : 1 }
            : {}),
        });
      }
  }
  let camera = { x: 0, y: 0, scale: 1 };
  for (const action of compiled.camera) {
    if (time < action.at) continue;
    const progress = ease(
      action.action === "follow" ? "travel-path" : "rearrange",
      (time - action.at) / Math.max(0.001, action.end - action.at),
    );
    const target = targetCamera(action, states);
    camera = {
      x: interpolate(camera.x, target.x, progress),
      y: interpolate(camera.y, target.y, progress),
      scale: interpolate(camera.scale, target.scale, progress),
    };
  }
  return {
    objects: [...states.values()],
    connectors: connectors.map((connector) =>
      routeConnector(connector, states),
    ),
    camera,
  };
}
