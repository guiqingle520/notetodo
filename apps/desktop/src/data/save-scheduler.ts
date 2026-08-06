/**
 * Coalesces rapid editor updates by key. Typing 100 characters into one page
 * therefore performs one SQLite upsert, while edits to separate pages remain
 * independent and cannot overwrite each other.
 */
export class SaveScheduler<T extends { id: string }> {
  private readonly pending = new Map<string, T>()
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(
    private readonly writer: (value: T) => Promise<unknown>,
    private readonly delayMs = 350,
  ) {}

  schedule(value: T) {
    this.pending.set(value.id, value)
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.flush(), this.delayMs)
  }

  async flush() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
    const batch = [...this.pending.values()]
    this.pending.clear()
    await Promise.all(batch.map((value) => this.writer(value)))
  }

  get pendingCount() {
    return this.pending.size
  }
}

