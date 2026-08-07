export interface RoomClaims { pageId: string; userId: string; name: string; color: string; role?: 'viewer' | 'commenter' | 'editor' | 'owner'; ttlSeconds?: number }
export interface VerifiedRoomClaims extends Omit<RoomClaims, 'ttlSeconds'> { aud: string; iat: number; exp: number }
export function signRoomTicket(claims: RoomClaims, secret: string, now?: number): string
export function verifyRoomTicket(token: string, pageId: string, secret: string, now?: number): VerifiedRoomClaims | null
export type ApiScope = 'pages:read' | 'pages:write' | 'databases:read' | 'databases:write' | 'webhooks:manage' | 'automations:manage'
export const API_SCOPES: readonly ApiScope[]
export interface StoredApiToken { id: string; secretHash: string; scopes: ApiScope[]; expiresAt?: string | null; revokedAt?: string | null }
export interface CreatedApiToken extends StoredApiToken { rawToken: string; prefix: string }
export function hashApiTokenSecret(secret: string): string
export function createApiToken(scopes: ApiScope[], options?: { id?: string; randomBytes?: (size: number) => Buffer }): CreatedApiToken
export function verifyApiToken(rawToken: string, storedToken: StoredApiToken, requiredScope: ApiScope, now?: number): boolean
