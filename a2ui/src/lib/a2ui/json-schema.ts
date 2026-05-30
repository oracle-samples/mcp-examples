import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";
import type { A2UICatalogSchema } from "./catalogs/types.ts";

const ajv = new Ajv({
  allErrors: true,
  allowUnionTypes: true,
  strict: false,
  validateSchema: true,
});

const validatorCache = new WeakMap<A2UICatalogSchema, ValidateFunction>();

export function validateJsonSchema(
  value: unknown,
  schema: A2UICatalogSchema,
  path: string,
  errors: string[],
) {
  let validator: ValidateFunction;

  try {
    validator = getValidator(schema);
  } catch (error) {
    errors.push(
      `${path} uses an invalid catalog schema: ${
        error instanceof Error ? error.message : "unknown schema error"
      }.`,
    );
    return;
  }

  if (validator(value)) {
    return;
  }

  for (const error of validator.errors ?? []) {
    errors.push(formatSchemaError(path, error));
  }
}

function getValidator(schema: A2UICatalogSchema) {
  const cached = validatorCache.get(schema);
  if (cached) {
    return cached;
  }

  const validator = ajv.compile(schema);
  validatorCache.set(schema, validator);
  return validator;
}

function formatSchemaError(path: string, error: ErrorObject) {
  if (error.keyword === "required") {
    const missingProperty = String(error.params.missingProperty ?? "").trim();
    return missingProperty
      ? `${path}.${missingProperty} is required.`
      : `${path} is missing a required property.`;
  }

  if (error.keyword === "additionalProperties") {
    const additionalProperty = String(
      (error.params as { additionalProperty?: unknown }).additionalProperty ?? "",
    ).trim();
    return additionalProperty
      ? `${path}.${additionalProperty} is not allowed by the active catalog schema.`
      : `${path} has an unexpected property.`;
  }

  const instancePath = normalizeInstancePath(error.instancePath);
  const qualifiedPath = instancePath ? `${path}.${instancePath}` : path;
  return `${qualifiedPath} ${error.message ?? "is invalid."}`;
}

function normalizeInstancePath(instancePath: string) {
  if (!instancePath) {
    return "";
  }

  return instancePath
    .split("/")
    .filter(Boolean)
    .map(unescapeJsonPointerToken)
    .join(".");
}

function unescapeJsonPointerToken(value: string) {
  return value.replace(/~1/g, "/").replace(/~0/g, "~");
}
