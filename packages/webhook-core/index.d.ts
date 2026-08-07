export type WebhookEvent = 'page.created' | 'page.updated' | 'page.archived' | 'database.record.created' | 'database.record.updated'
export const WEBHOOK_EVENTS: readonly WebhookEvent[]
export interface WebhookEnvelope<T = unknown> { apiVersion: '2026-08-01'; deliveryId: string; event: WebhookEvent; occurredAt: string; data: T }
export function stableJson(value: unknown): string
export function createWebhookEnvelope<T>(event: WebhookEvent, deliveryId: string, occurredAt: string, data: T): WebhookEnvelope<T>
export function signWebhook(secret: string, timestamp: string | number, body: string): string
export function verifyWebhookSignature(secret: string, timestamp: string | number, body: string, signature: string, now?: number, toleranceMs?: number): boolean
export function nextWebhookAttempt(attemptNumber: number, now?: number): string
export function validateWebhookUrl(input: string): string
export function isPrivateNetworkAddress(address: string): boolean
