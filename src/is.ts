/* c8 ignore start */
export function isArray<T>(value: unknown): value is T[];
export function isArray(value: unknown): value is unknown[];
export function isArray(value: unknown): boolean {
  return Array.isArray(value);
}

function isObjectLike(node: unknown): node is Record<string | symbol | number, unknown> {
  return !!node && (typeof node === "object" || typeof node === "function");
}

export function isPromise(input: unknown): input is Promise<unknown> {
  return isObjectLike(input) && typeof input.then === "function";
}

export function ok(
    value: unknown,
    message?: string
): asserts value;
export function ok<T>(
    value: unknown,
    message?: string
): asserts value is T;
export function ok(
    value: unknown,
    message?: string
): asserts value {
  if (!value) {
    throw new Error(message ?? "Expected value");
  }
}