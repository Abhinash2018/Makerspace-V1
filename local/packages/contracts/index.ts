import { z } from 'zod';

export const requestIdSchema = z.uuid();
export const serviceSchema = z.enum(['gateway', 'attendance', 'knowledge']);
export const modelCodeSchema = z.enum([
  'ready', 'model_not_configured', 'runtime_unavailable', 'model_missing', 'timeout',
  'invalid_response', 'response_too_large', 'redirect_rejected', 'cancelled', 'http_error', 'cloud_model_rejected',
]);
export const componentCodeSchema = z.enum([
  ...modelCodeSchema.options, 'db_unavailable', 'migrations_required', 'ui_missing', 'dependency_unavailable',
]);
export const liveSchema = z.strictObject({ requestId: requestIdSchema, service: serviceSchema, live: z.literal(true) });
export const readySchema = z.strictObject({
  requestId: requestIdSchema, service: serviceSchema, ready: z.boolean(), code: componentCodeSchema,
});
export const errorSchema = z.strictObject({
  error: z.strictObject({
    code: z.enum(['not_found', 'unauthorized', 'forbidden_host', 'forbidden_origin', 'bad_request', 'internal_error', 'request_too_large',
      'forbidden_csrf', 'forbidden_role', 'rate_limited', 'auth_unavailable', 'session_capacity', 'idempotency_conflict', 'attendance_unavailable', 'knowledge_unavailable']),
    message: z.string().min(1).max(100), requestId: requestIdSchema,
  }),
});
export const modelStatusSchema = z.strictObject({
  requestId: requestIdSchema, runtimeAvailable: z.boolean().nullable(), modelAvailable: z.boolean(), code: modelCodeSchema,
});
export const componentSchema = z.strictObject({ ready: z.boolean(), code: componentCodeSchema });
export const systemStatusSchema = z.strictObject({
  apiVersion: z.literal(1), requestId: requestIdSchema, state: z.enum(['ready', 'degraded', 'unavailable']),
  components: z.strictObject({ gateway: componentSchema, attendance: componentSchema, knowledge: componentSchema, ollama: componentSchema }),
});
export type Service = z.infer<typeof serviceSchema>;
export type ModelCode = z.infer<typeof modelCodeSchema>;
export type ModelStatus = z.infer<typeof modelStatusSchema>;
export type Component = z.infer<typeof componentSchema>;
export type SystemStatus = z.infer<typeof systemStatusSchema>;
export type Configuration = ReturnType<typeof import('../config/index.mjs').loadConfiguration>;

// Browser auth v1. Session bearer identifiers are cookie-only, never JSON.
export const sessionResponseSchema = z.strictObject({
  requestId: requestIdSchema, role: z.enum(['kiosk', 'staff']),
  csrfToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  idleExpiresInMs: z.number().nonnegative().max(28_800_000),
  absoluteExpiresInMs: z.number().nonnegative().max(28_800_000),
}).refine(value => value.idleExpiresInMs <= value.absoluteExpiresInMs);
export const sessionRequestSchema = z.strictObject({});
export const staffLoginSchema = z.strictObject({ password: z.string().min(1).max(256) });
export const signedOutSchema = z.strictObject({ requestId: requestIdSchema, signedOut: z.literal(true) });
export type BrowserSession = z.infer<typeof sessionResponseSchema>;
