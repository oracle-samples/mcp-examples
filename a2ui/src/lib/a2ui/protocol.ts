import { A2uiMessageProcessor } from "@a2ui/web_core/data/model-processor";
import type {
  BeginRenderingMessage as OfficialBeginRenderingMessage,
  ComponentInstance,
  DataMap,
  DataModelUpdate,
  DataValue,
  DeleteSurfaceMessage,
  ServerToClientMessage as OfficialServerToClientMessage,
  SurfaceUpdateMessage,
  Surface,
  ValueMap,
} from "@a2ui/web_core/types/types";

export type A2UIBoundString =
  | { literalString: string }
  | { path: string };

export type ExplicitList = {
  explicitList: string[];
};

export type A2UIComponentProperties = {
  children?: ExplicitList | string[];
  distribution?: string;
  alignment?: string;
  variant?: string;
  child?: string;
  text?: A2UIBoundString;
  primary?: boolean;
  action?: {
    name: string;
    context?: Array<{
      key: string;
      value:
        | { path: string }
        | { literalString: string }
        | { literalNumber: number }
        | { literalBoolean: boolean };
    }>;
  };
  axis?: "horizontal" | "vertical";
  [key: string]: unknown;
};

export type A2UIComponent = ComponentInstance & {
  component: Record<string, A2UIComponentProperties>;
};

export type A2UIDataEntry = ValueMap;

export type A2UIMessage = Omit<
  OfficialServerToClientMessage,
  "beginRendering" | "surfaceUpdate" | "dataModelUpdate" | "deleteSurface"
> & {
  beginRendering?: OfficialBeginRenderingMessage & {
    catalogId?: string;
  };
  surfaceUpdate?: SurfaceUpdateMessage & {
    components: A2UIComponent[];
  };
  dataModelUpdate?: DataModelUpdate;
  deleteSurface?: DeleteSurfaceMessage;
};

export type A2UIDataValue =
  | string
  | number
  | boolean
  | null
  | A2UIDataMap
  | A2UIDataValue[];

export interface A2UIDataMap {
  [key: string]: A2UIDataValue;
}

export type A2UIStreamSummary = {
  surfaceId: string;
  root: string | null;
  catalogId?: string;
  meta: A2UIDataMap;
};

export type A2UISurfaceState = {
  surfaceId: string;
  root: string | null;
  catalogId?: string;
  components: Record<string, A2UIComponent>;
  dataModel: A2UIDataMap;
  styles?: Record<string, string>;
};

export function serializeA2UIStream(messages: A2UIMessage[]): string {
  return `${messages.map((message) => JSON.stringify(message)).join("\n")}\n`;
}

export function parseA2UIStream(raw: string): A2UIMessage[] {
  const trimmed = raw.trim();

  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return normalizeParsedMessages(parsed);
  } catch {
    return trimmed
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as unknown)
      .flatMap((value) => normalizeParsedMessages(value));
  }
}

export function materializeA2UISurface(
  messages: A2UIMessage[],
): A2UISurfaceState {
  const processor = new A2uiMessageProcessor();
  processor.processMessages(messages);
  const summary = summarizeA2UIStream(messages);
  const surface = processor.getSurfaces().get(summary.surfaceId);

  return toSurfaceState(summary, surface);
}

export function summarizeA2UIStream(messages: A2UIMessage[]): A2UIStreamSummary {
  const state: A2UISurfaceState = {
    surfaceId: "main",
    root: null,
    catalogId: undefined,
    components: {},
    dataModel: {},
  };

  for (const message of messages) {
    if (message.deleteSurface) {
      if (message.deleteSurface.surfaceId === state.surfaceId) {
        state.root = null;
        state.dataModel = {};
      }
      continue;
    }

    if (message.surfaceUpdate) {
      state.surfaceId = message.surfaceUpdate.surfaceId;
      continue;
    }

    if (message.dataModelUpdate) {
      state.surfaceId = message.dataModelUpdate.surfaceId;
      applyDataModelUpdate(
        state.dataModel,
        message.dataModelUpdate.contents,
        message.dataModelUpdate.path,
      );
      continue;
    }

    if (message.beginRendering) {
      state.surfaceId = message.beginRendering.surfaceId;
      state.root = message.beginRendering.root;
      state.catalogId = message.beginRendering.catalogId;
      state.styles = message.beginRendering.styles;
    }
  }

  return {
    surfaceId: state.surfaceId,
    root: state.root,
    catalogId: state.catalogId,
    meta: isDataMap(state.dataModel.meta) ? state.dataModel.meta : {},
  };
}

export function getComponentEntry(component: A2UIComponent) {
  const entry = Object.entries(component.component)[0];
  if (!entry) {
    return null;
  }

  const [componentType, properties] = entry;
  return {
    componentType,
    properties,
  };
}

export function resolveBoundString(
  value: A2UIBoundString,
  dataModel: A2UIDataMap,
): string {
  if ("literalString" in value) {
    return value.literalString;
  }

  const resolved = resolvePath(dataModel, value.path);
  if (typeof resolved === "string") {
    return resolved;
  }

  if (typeof resolved === "number" || typeof resolved === "boolean") {
    return String(resolved);
  }

  return "";
}

function normalizeParsedMessages(value: unknown): A2UIMessage[] {
  if (Array.isArray(value)) {
    return value.filter(isA2UIMessage);
  }

  return isA2UIMessage(value) ? [value] : [];
}

function isA2UIMessage(value: unknown): value is A2UIMessage {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isRecord(value.beginRendering) ||
    isRecord(value.surfaceUpdate) ||
    isRecord(value.dataModelUpdate) ||
    isRecord(value.deleteSurface)
  );
}

function toSurfaceState(
  summary: A2UIStreamSummary,
  surface: Surface | undefined,
): A2UISurfaceState {
  return {
    surfaceId: summary.surfaceId,
    root: surface?.rootComponentId ?? summary.root,
    catalogId: summary.catalogId,
    components: surface ? convertComponents(surface.components) : {},
    dataModel: surface ? convertDataMap(surface.dataModel) : {},
    styles: surface?.styles,
  };
}

function convertComponents(components: Surface["components"]) {
  const next: Record<string, A2UIComponent> = {};

  for (const [id, component] of components.entries()) {
    next[id] = component as A2UIComponent;
  }

  return next;
}

function convertDataMap(value: DataMap | Map<string, DataValue>) {
  const next: A2UIDataMap = {};

  for (const [key, entry] of value.entries()) {
    next[key] = convertDataValue(entry);
  }

  return next;
}

function convertDataValue(value: DataValue): A2UIDataValue {
  if (value instanceof Map) {
    return convertDataMap(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => convertDataValue(entry));
  }

  if (isRecord(value)) {
    const next: A2UIDataMap = {};
    for (const [key, entry] of Object.entries(value)) {
      next[key] = convertDataValue(entry as DataValue);
    }
    return next;
  }

  return value;
}

function applyDataModelUpdate(
  target: A2UIDataMap,
  entries: A2UIDataEntry[],
  path?: string,
) {
  const fragment = decodeEntries(entries);

  if (!path || path === "/") {
    mergeMaps(target, fragment);
    return;
  }

  const segments = path
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    mergeMaps(target, fragment);
    return;
  }

  let cursor: A2UIDataMap = target;

  for (const segment of segments.slice(0, -1)) {
    const current = cursor[segment];
    if (!isDataMap(current)) {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as A2UIDataMap;
  }

  const leaf = segments.at(-1);
  if (!leaf) {
    return;
  }

  const current = cursor[leaf];
  if (isDataMap(current)) {
    mergeMaps(current, fragment);
  } else {
    cursor[leaf] = fragment;
  }
}

function decodeEntries(entries: A2UIDataEntry[]): A2UIDataMap {
  const next: A2UIDataMap = {};

  for (const entry of entries) {
    next[entry.key] = decodeEntry(entry);
  }

  return next;
}

function decodeEntry(entry: A2UIDataEntry): A2UIDataValue {
  if (typeof entry.valueString === "string") {
    return entry.valueString;
  }

  if (typeof entry.valueNumber === "number") {
    return entry.valueNumber;
  }

  if (typeof entry.valueBoolean === "boolean") {
    return entry.valueBoolean;
  }

  if (Array.isArray(entry.valueMap)) {
    return decodeEntries(entry.valueMap);
  }

  return null;
}

function mergeMaps(target: A2UIDataMap, source: A2UIDataMap) {
  for (const [key, value] of Object.entries(source)) {
    if (isDataMap(value) && isDataMap(target[key])) {
      mergeMaps(target[key] as A2UIDataMap, value);
      continue;
    }

    target[key] = value;
  }
}

function resolvePath(model: A2UIDataMap, path: string): A2UIDataValue | undefined {
  const segments = path
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  let cursor: A2UIDataValue = model;

  for (const segment of segments) {
    if (!isDataMap(cursor)) {
      return undefined;
    }
    cursor = cursor[segment];
  }

  return cursor;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDataMap(value: A2UIDataValue | undefined): value is A2UIDataMap {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}
