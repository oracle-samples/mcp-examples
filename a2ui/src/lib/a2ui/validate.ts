import type { A2UICatalogRuntime } from "./catalogs/types.ts";
import type { A2UIDataEntry, A2UIMessage } from "./protocol.ts";
import { validateJsonSchema } from "./json-schema.ts";

const MESSAGE_KINDS = [
  "beginRendering",
  "surfaceUpdate",
  "dataModelUpdate",
  "deleteSurface",
] as const;

const DATA_VALUE_KEYS = [
  "valueString",
  "valueNumber",
  "valueBoolean",
  "valueMap",
] as const;

export class A2UIProtocolValidationError extends Error {}

export function validateA2UIMessageStream(
  messages: A2UIMessage[],
  catalogRuntime: A2UICatalogRuntime,
) {
  const errors: string[] = [];
  const surfaceComponentIds = new Map<string, Set<string>>();
  const beginRenderingRoots: Array<{ surfaceId: string; root: string }> = [];

  for (let index = 0; index < messages.length; index += 1) {
    validateMessage(
      messages[index],
      index,
      catalogRuntime,
      surfaceComponentIds,
      beginRenderingRoots,
      errors,
    );
  }

  for (const { surfaceId, root } of beginRenderingRoots) {
    const knownComponents = surfaceComponentIds.get(surfaceId);
    if (knownComponents && !knownComponents.has(root)) {
      errors.push(
        `beginRendering for surface "${surfaceId}" references unknown root component "${root}".`,
      );
    }
  }

  if (errors.length > 0) {
    throw new A2UIProtocolValidationError(errors.join("\n"));
  }
}

function validateMessage(
  message: A2UIMessage,
  index: number,
  catalogRuntime: A2UICatalogRuntime,
  surfaceComponentIds: Map<string, Set<string>>,
  beginRenderingRoots: Array<{ surfaceId: string; root: string }>,
  errors: string[],
) {
  const presentKinds = MESSAGE_KINDS.filter((kind) => message[kind]);
  if (presentKinds.length !== 1) {
    errors.push(
      `Message ${index} must contain exactly one of ${MESSAGE_KINDS.join(", ")}.`,
    );
    return;
  }

  if (message.beginRendering) {
    validateBeginRendering(
      message.beginRendering,
      catalogRuntime,
      beginRenderingRoots,
      errors,
    );
    return;
  }

  if (message.surfaceUpdate) {
    validateSurfaceUpdate(
      message.surfaceUpdate,
      catalogRuntime,
      surfaceComponentIds,
      errors,
    );
    return;
  }

  if (message.dataModelUpdate) {
    validateDataModelUpdate(message.dataModelUpdate, errors);
    return;
  }

  if (message.deleteSurface) {
    if (typeof message.deleteSurface.surfaceId !== "string") {
      errors.push("deleteSurface.surfaceId must be a string.");
    }
  }
}

function validateBeginRendering(
  message: NonNullable<A2UIMessage["beginRendering"]>,
  catalogRuntime: A2UICatalogRuntime,
  beginRenderingRoots: Array<{ surfaceId: string; root: string }>,
  errors: string[],
) {
  if (typeof message.surfaceId !== "string") {
    errors.push("beginRendering.surfaceId must be a string.");
  }
  if (typeof message.root !== "string") {
    errors.push("beginRendering.root must be a string.");
  }
  if (
    message.catalogId !== undefined &&
    typeof message.catalogId !== "string"
  ) {
    errors.push("beginRendering.catalogId must be a string when provided.");
  }

  if (
    typeof message.surfaceId === "string" &&
    typeof message.root === "string"
  ) {
    beginRenderingRoots.push({
      surfaceId: message.surfaceId,
      root: message.root,
    });
  }

  if (message.styles === undefined) {
    return;
  }

  if (!isRecord(message.styles)) {
    errors.push("beginRendering.styles must be an object when provided.");
    return;
  }

  for (const [styleName, styleValue] of Object.entries(message.styles)) {
    const styleSchema = catalogRuntime.catalog.styles[styleName];
    if (!styleSchema) {
      errors.push(
        `beginRendering.styles.${styleName} is not declared by catalog "${catalogRuntime.catalog.catalogId}".`,
      );
      continue;
    }

    validateSchema(
      styleValue,
      styleSchema,
      `beginRendering.styles.${styleName}`,
      errors,
    );
  }
}

function validateSurfaceUpdate(
  message: NonNullable<A2UIMessage["surfaceUpdate"]>,
  catalogRuntime: A2UICatalogRuntime,
  surfaceComponentIds: Map<string, Set<string>>,
  errors: string[],
) {
  if (typeof message.surfaceId !== "string") {
    errors.push("surfaceUpdate.surfaceId must be a string.");
  }

  if (!Array.isArray(message.components) || message.components.length === 0) {
    errors.push("surfaceUpdate.components must be a non-empty array.");
    return;
  }

  const idsForSurface = surfaceComponentIds.get(message.surfaceId) ?? new Set<string>();
  surfaceComponentIds.set(message.surfaceId, idsForSurface);

  const messageIds = new Set<string>();
  for (const component of message.components) {
    if (typeof component.id !== "string") {
      errors.push("surfaceUpdate.components[*].id must be a string.");
      continue;
    }

    if (messageIds.has(component.id)) {
      errors.push(`Duplicate component id "${component.id}" in surfaceUpdate.`);
    }
    messageIds.add(component.id);
    idsForSurface.add(component.id);

    if (
      component.weight !== undefined &&
      (typeof component.weight !== "number" || !Number.isFinite(component.weight))
    ) {
      errors.push(`Component "${component.id}" has a non-numeric weight.`);
    }

    if (!isRecord(component.component)) {
      errors.push(`Component "${component.id}" must define a component object.`);
      continue;
    }

    const componentEntries = Object.entries(component.component);
    if (componentEntries.length !== 1) {
      errors.push(
        `Component "${component.id}" must wrap exactly one catalog component type.`,
      );
      continue;
    }

    const [componentType, properties] = componentEntries[0];
    const schema = catalogRuntime.catalog.components[componentType];
    if (!schema) {
      errors.push(
        `Component "${component.id}" uses unsupported type "${componentType}" for catalog "${catalogRuntime.catalog.catalogId}".`,
      );
      continue;
    }

    validateSchema(
      properties,
      schema,
      `surfaceUpdate.components.${component.id}.${componentType}`,
      errors,
    );
  }
}

function validateDataModelUpdate(
  message: NonNullable<A2UIMessage["dataModelUpdate"]>,
  errors: string[],
) {
  if (typeof message.surfaceId !== "string") {
    errors.push("dataModelUpdate.surfaceId must be a string.");
  }

  if (
    message.path !== undefined &&
    typeof message.path !== "string"
  ) {
    errors.push("dataModelUpdate.path must be a string when provided.");
  }

  if (!Array.isArray(message.contents)) {
    errors.push("dataModelUpdate.contents must be an array.");
    return;
  }

  message.contents.forEach((entry, index) =>
    validateDataEntry(entry, `dataModelUpdate.contents[${index}]`, errors),
  );
}

function validateDataEntry(entry: A2UIDataEntry, path: string, errors: string[]) {
  if (!isRecord(entry)) {
    errors.push(`${path} must be an object.`);
    return;
  }

  if (typeof entry.key !== "string") {
    errors.push(`${path}.key must be a string.`);
  }

  const presentValueKeys = DATA_VALUE_KEYS.filter((key) => key in entry);
  if (presentValueKeys.length !== 1) {
    errors.push(`${path} must contain exactly one typed value property.`);
  }

  for (const key of Object.keys(entry)) {
    if (key !== "key" && !DATA_VALUE_KEYS.includes(key as (typeof DATA_VALUE_KEYS)[number])) {
      errors.push(`${path}.${key} is not a valid data model property.`);
    }
  }

  if ("valueString" in entry && typeof entry.valueString !== "string") {
    errors.push(`${path}.valueString must be a string.`);
  }

  if ("valueNumber" in entry && typeof entry.valueNumber !== "number") {
    errors.push(`${path}.valueNumber must be a number.`);
  }

  if ("valueBoolean" in entry && typeof entry.valueBoolean !== "boolean") {
    errors.push(`${path}.valueBoolean must be a boolean.`);
  }

  if ("valueMap" in entry) {
    if (!Array.isArray(entry.valueMap)) {
      errors.push(`${path}.valueMap must be an array.`);
    } else {
      entry.valueMap.forEach((child, index) =>
        validateDataEntry(child, `${path}.valueMap[${index}]`, errors),
      );
    }
  }
}

function validateSchema(
  value: unknown,
  schema: Record<string, unknown>,
  path: string,
  errors: string[],
) {
  validateJsonSchema(value, schema, path, errors);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
