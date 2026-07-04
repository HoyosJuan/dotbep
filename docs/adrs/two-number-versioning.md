# ADR — BEPs are versioned as two-number `{major}.{minor}`

## Context

Commits to a `.bep` happen at different scales — from a small, punctual edit (adjusting a deliverable's date, tweaking a workflow) to a milestone significant enough to be treated as a discrete, referenceable state of the plan. A versioning scheme is needed to represent this distinction in the version identifier itself.

## Decision

**BEPs are versioned as two numbers: `{major}.{minor}`.**

- **`minor`** bumps on a `patch` commit — a small, punctual change, typical of work in progress while editing toward the next major version.
- **`major`** bumps on a `version` commit — a significant, referenceable version of the plan.

## Reasoning

Two tiers match the two kinds of change that actually occur in BEP authoring: in-progress edits and milestone versions. A third tier (semver's `patch` on top of `minor`) would be excessive — there's no third distinct category of change in this domain that would justify it, only added bookkeeping complexity with no corresponding value. A single counter, conversely, would be insufficient: it would conflate a one-field tweak with a significant milestone, making the version number useless as a signal of how meaningful a given state actually is.

## Alternatives discarded

**Three-number semver (`{major}.{minor}.{patch}`)** — rejected because it introduces a tier of granularity BEP authoring has no use for; nothing in the domain distinguishes a "patch" from a "minor" change the way semver does for library releases.

**Single incrementing number** — rejected because it cannot distinguish a small work-in-progress edit from a significant milestone, forcing both onto the same counter and erasing the distinction a reader of the version history would want.

## Consequences

- `minor` increments are expected to be frequent and cheap — normal during active editing of a BEP.
- `major` increments are comparatively rare and mark the versions meant to be referenced or approved as a whole.
- Any workflow that treats versions as significant milestones (e.g. requiring approval) should key off `major` bumps specifically, not `minor` ones.
