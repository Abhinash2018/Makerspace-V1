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
    code: z.enum(['not_found', 'unauthorized', 'forbidden_host', 'forbidden_origin', 'bad_request', 'internal_error', 'request_too_large']),
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
