// The optional extra lines of a key (the Value key's second line, the Switch key's value line):
// an attribute picker whose empty choice means "no line". The entity's own state therefore needs a
// choice of its own, STATE_ATTRIBUTE. Shared by the plugin and the PI.

/** The picker value for "the state of the entity" in an optional line. */
export const STATE_ATTRIBUTE = "@state";

/**
 * Whether an optional line is set up, and which attribute it reads (undefined: the state). A line
 * is on with an attribute, with the state choice, or with an entity of its own (then its state).
 */
export function optionalLine(attribute: string | undefined, entityId: string | undefined): { on: boolean; attribute: string | undefined } {
    const a = attribute?.trim() ?? "";
    if (a === STATE_ATTRIBUTE) return { on: true, attribute: undefined };
    return { on: a !== "" || !!entityId?.trim(), attribute: a || undefined };
}
