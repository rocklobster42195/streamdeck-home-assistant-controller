// The dial's two views: the normal one and the settings mode, where a push steps through the
// levels (colour temperature, hue, ...) and a tap goes back. It knows nothing of Home Assistant: the
// levels are names, and the mode closes by itself after a while without input.

export class DialMode<L extends string> {
    private levels: L[] = [];
    private index = 0;
    private isOpen = false;
    private timer?: ReturnType<typeof setTimeout>;

    /** `onChange` is called when the view or the active level changes (the dial redraws). */
    constructor(
        private readonly onChange: () => void,
        private readonly timeoutMs = 10_000,
    ) {}

    /** The levels the entity offers now. The active one stays if it is still there; none left closes the mode. */
    setLevels(levels: L[]): void {
        const active = this.active;
        this.levels = levels;
        if (!levels.length) return this.close();
        if (this.isOpen) this.index = Math.max(0, active ? levels.indexOf(active) : 0);
    }

    get available(): readonly L[] {
        return this.levels;
    }

    /** Whether the settings mode is shown. */
    get open(): boolean {
        return this.isOpen;
    }

    /** The level the settings mode shows; undefined in the normal view. */
    get active(): L | undefined {
        return this.isOpen ? this.levels[this.index] : undefined;
    }

    /** Position of the active level for a hint like "2/3". */
    get position(): { index: number; count: number } {
        return { index: this.index, count: this.levels.length };
    }

    /** Go into the settings mode (at the first level); false when there is nothing to set. */
    enter(): boolean {
        if (!this.levels.length) return false;
        this.isOpen = true;
        this.index = 0;
        this.touch();
        this.onChange();
        return true;
    }

    /** The next level, round and round. */
    next(): void {
        if (!this.isOpen) return;
        this.index = (this.index + 1) % this.levels.length;
        this.touch();
        this.onChange();
    }

    /** Back to the normal view. */
    back(): void {
        if (!this.isOpen) return;
        this.close();
        this.onChange();
    }

    /** Input happened: the timeout starts again. */
    touch(): void {
        clearTimeout(this.timer);
        if (this.isOpen) this.timer = setTimeout(() => this.back(), this.timeoutMs);
    }

    dispose(): void {
        clearTimeout(this.timer);
    }

    private close(): void {
        this.isOpen = false;
        this.index = 0;
        clearTimeout(this.timer);
    }
}
