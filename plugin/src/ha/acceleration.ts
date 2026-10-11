// Turning a dial fast moves further per notch: while the notches follow each other quickly in one
// direction, the steps grow (x1, x2, x3, ... up to a limit). A pause or the other direction starts
// over, so a single notch is always one step and fine-tuning stays exact.

export class Accelerator {
    private last = 0;
    private direction = 0;
    private streak = 0;

    /**
     * @param max the largest multiplier
     * @param gapMs notches further apart than this are not one spin
     * @param notchesPerStep how many notches in a row it takes to reach the next multiplier
     */
    constructor(
        private readonly max: number,
        private readonly gapMs = 150,
        private readonly notchesPerStep = 3,
        private readonly clock: () => number = Date.now,
    ) {}

    /** The ticks of one dial event, multiplied by the pace the dial is turned at. */
    apply(ticks: number): number {
        if (!ticks) return 0;
        const now = this.clock();
        const direction = Math.sign(ticks);
        if (direction === this.direction && now - this.last <= this.gapMs) this.streak += Math.abs(ticks);
        else this.streak = 0;
        this.direction = direction;
        this.last = now;
        const multiplier = Math.min(this.max, 1 + Math.floor(this.streak / this.notchesPerStep));
        return ticks * multiplier;
    }

    reset(): void {
        this.direction = 0;
        this.streak = 0;
    }
}
