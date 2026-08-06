export interface RoomClaims { pageId: string; userId: string; name: string; color: string; ttlSeconds?: number }
export interface VerifiedRoomClaims extends Omit<RoomClaims, 'ttlSeconds'> { aud: string; iat: number; exp: number }
export function signRoomTicket(claims: RoomClaims, secret: string, now?: number): string
export function verifyRoomTicket(token: string, pageId: string, secret: string, now?: number): VerifiedRoomClaims | null
