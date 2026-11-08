# Swimlane Diagram Standard

Developer: Jimmy C

This standard is intentionally project-neutral. Teams can copy it into their own workflow docs and replace the example lane set with their own domain language.

## Core Rules

1. Every diagram must have a clear start and a clear end.
2. Use lane groups to separate responsibility, for example:
   - People
   - Interfaces
   - Records
   - External systems
   - Notes
3. Show only the lanes used by the current process.
4. Node content must match the node lane responsibility.
   - People lanes describe human action or decisions.
   - Interface lanes describe screen, form, or API-facing operation.
   - Record lanes describe persisted state or business records.
   - External system lanes describe handoff to systems outside the team boundary.
5. Do not draw a person directly writing to a persisted record lane. Add an interface or system operation node between them.
6. Prefer this rhythm for business process diagrams:
   - Person action or decision
   - Interface operation or submission
   - System record creation or state update
   - Next handoff or end state
7. Keep business scenario names separate from product function names.
   - Scenario example: employee submits a reimbursement request.
   - Function example: expense form.
8. Put open questions, caveats, and process notes in note nodes inside the diagram when they affect diagram interpretation.
9. Mark each diagram version:
   - Draft: still being discussed.
   - Confirmed: accepted as downstream reference.
10. Newly created diagrams should be easy to find. A common default is to put new flows at the top of the tab/order list.

## Layout Rules

1. The highest process node should be the real business start state.
2. Do not use placeholder starts such as "choose scenario" when the actual start state is known.
3. Main flow should read top to bottom.
4. Branches should rejoin below the branch source, not above it.
5. Edge labels must not collide with node boundaries, arrows, or other text.
6. If labels are cramped, increase node spacing or use different connection points.
7. Same-lane or adjacent-lane nodes need enough vertical space for labels and routed lines.

## Connection Rules

1. A node connection point can be used by only one edge.
2. Incoming and outgoing edges both count toward that one-edge limit.
3. If a node needs multiple edges, use different connection points or adjust layout.
4. After changing JSON directly, run a handle uniqueness check before review.

## Review Checklist

Before handing a diagram to another developer or reviewer:

1. Confirm the diagram has a start and end.
2. Confirm each node is in the correct lane.
3. Confirm no human node directly writes to a record lane.
4. Confirm all important handoffs are visible.
5. Confirm edge labels are readable.
6. Confirm connection handles are unique per node.
7. Open the UI for large redraws and visually inspect spacing, labels, and reading order.
