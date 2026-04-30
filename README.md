![dotBEP](resources/dotbep_github_banner.png)

# dotBEP

## What is this?

An open .bep **data format designed to author and run BIM Execution Plans (BEPs)**. The goal is to replace text-based BEPs with a structured data format that enables:

- Integration with AI agents to manage the BEP in natural language.
- Dynamic and custom frontends for navigating BEPs.
- Integration with BIM apps as a contract on how they must behave for a project.
- Deriving information like responsibility matrices, TIDPs, MIDPs, deliverable naming codes, etc.
- Build BEP software, so they are treated as programs rather than documents.
- A transparent version history.

The BEP data is designed to answer:

| Question | Schema |
| --- | --- |
| What is this document about? | `project.description` |
| What project are we working on? | `project` — `name`, `code`, `clientId` |
| Who will participate? | `members`, `roles`, `teams` |
| What will each participant do? | `roles` → `teams` → `members`, RACI per workflow node |
| What will we do and why? | `bimUses`, `objectives` |
| What do we need to do it? | `softwares`, `bimUses[].software` |
| What is the model scope? | `lods`, `lois`, `loin` |
| How and with what guidelines will we do it? | `workflows`, `actions`, `standards`, `guides` |
| How do we ensure success? | runtime |
| Who delivers what and when? | `deliverables`, `milestones`, `phases`, `lbs` |

---

## The `.bep` format

A `.bep` file is a **zip** with the following structure:

```
project.bep
├── bep.json                          ← current state (latest version)
├── changelog.json                    ← { current, versions[] }
├── baseline/                         ← last committed state (reference for diffs and discard)
│   ├── bep.json                      ← JSON snapshot of the previous version (cache for commits)
│   └── standards/
│       └── {standard-id}.md          ← baseline of each .md at the time of the last commit
├── changelog/
│   ├── v0.0.json                     ← initial snapshot (terminus of the diff chain)
│   ├── v0.1.diff.json                ← inverse diff: how to go from v0.1 → v0.0
│   ├── v1.0.diff.json                ← inverse diff: how to go from v1.0 → v0.x
│   └── standards/
│       └── {standard-id}/
│           └── v0.3.md               ← .md snapshot only if it changed in that version
├── standards/
│   └── {uuid}.md
├── guides/
│   └── ifc-guide.pdf
├── memory.md                         ← collective project memory (not versioned) usually managed proactively by an LLM
└── skills/
    └── {skill-name}/
        ├── SKILL.md                  ← LLM behavior for this skill (not versioned)
        └── resources/
            └── {filename}           ← supporting files for the skill
```

---

## Key design decisions

- Every schema entity is connected with others.
- Every schema entity has a clear and justifiable purpose in runtime.
- Every key in the schema is very self-explanatory, no matter if its verbose.
- **Everything is flat with ID-based references** — no deeply nested objects. `teams` have `memberEmails: string[]`, not nested Member objects.
- **`bep.json` always reflects the current state** (latest version). History is reconstructed by applying inverse diffs backwards.
- BEPs are versioned as **two-number `{major}.{minor}`**.
- There are files such as skills and memory which are LLM-first.
- There are schema entities, such as flags, wich are LLM-first.
- Some data can be derived from the existing schema entities, so no need to have them explicit to avoid bloated files:
  - Naming code for any deliverable
  - Responsibility matrix (crossing `FlowNode` RACI role IDs with `roles`, `members` and `teams`)
  - TIDP per team (filtering `deliverables` by `responsibleId`)
  - MIDP (all deliverables)
  - ISO 19650 team diagram (graph of `teams` by `isoRole`)
  - Any historical version (applying inverse diffs backwards from `bep.json`)
  - etc...

---

## Examples

Clone the repo, install dependencies, and run all examples:

```bash
git clone https://github.com/HoyosJuan/dotbep.git
npm install
npm run example
```

Each example in [`core/examples/`](./core/examples) covers a specific area of the schema: participants, workflows, standards, history, and more.

---

## Documentation

Detailed documentation for the format and schema lives in [`docs/`](./docs):

- [`docs/format/`](./docs/format) — `.bep` file structure, versioning model, `memory.md`, `skills/`
- [`docs/schema/`](./docs/schema) — all schema entities: project, participants, workflows, deliverables, etc.

---

## FAQ

<details>
<summary>Why an "executable" BEP? Isn't a document enough?</summary>

The problem with traditional BEPs is that nobody opens them again after the first meeting. They become a document of good intentions that isn't connected to what actually happens on the project. An executable BEP is different: the same document that defines the process is the one that executes and monitors it. Workflows aren't decorative diagrams, they are flows that advance with real team actions with a complete trace of who did what, when, and why.

</details>

<details>
<summary>We already have a coordination process that works. Why do we need executable workflows?</summary>

dotbep workflows don't replace your process, they formalize it into executable, traceable steps, decisions, and automations. The difference from having the process "in the team's head" is that it's recorded in one place, governed by an explicit agreement within the BEP. Anyone (or an AI) can check the exact state of any flow at any time, without searching through emails, meeting notes, or logs scattered across multiple tools. And when someone new joins the project, the workflow tells them exactly what to do, when, and what happened before.

</details>

<details>
<summary>What happens when the project changes and my workflow no longer applies?</summary>

Workflows don't have to be defined from day one. You can create ad-hoc flows when the need arises, model the process at that point, and start having traceability from there on. You can also design workflows that account for change from the start: alternative paths, conditional decisions, escalations. If you didn't know what you needed before, you weren't going to have traceability over it either. dotbep gives you the structure when you're ready to use it.

</details>

<details>
<summary>How is dotbep different from Plannerly?</summary>

Plannerly is strong in ISO 19650 compliance and the BIM document cycle: creating BEPs from templates, defining scope with LOIN, verifying models with its Verify module, and signing contracts with eSignature. dotbep doesn't compete at that layer. The fundamental difference is that Plannerly treats the BEP as a document to manage, while dotbep treats it as a program to execute. dotbep has a workflow engine with decision logic, code-driven automations, effects, etc.

</details>

<details>
<summary>How is it different from Procore's workflows?</summary>

Procore's workflows are built for a specific purpose: approval chains for financial and document processes — change orders, invoices, submittals. dotbep workflows are agnostic. You define them to model whatever your project actually needs — coordination processes, model reviews, information handovers, or yes, even invoice approvals if that's part of your BEP. The difference isn't what they can do, it's who decides: Procore defines the process for you; dotbep lets you define it yourself.

</details>

<details>
<summary>Isn't this the same as using Zapier or Make to integrate tools?</summary>

No. Zapier and Make are fire-and-forget, they run from start to finish without human intervention. In dotbep, humans are always part of the process. They don't just define the workflows; they actively participate in them, making decisions or partially delegating to automations. dotbep knows what step you're on, who is responsible, and which path to take based on the outcome. A Zap doesn't have that context.

</details>

<details>
<summary>Why is it open source? How is it sustained?</summary>

An open format means your data is yours, no vendor lock-in. Anyone can build tools on top of it. dotbep started as a side project by [Juan Hoyos](https://github.com/HoyosJuan), who also built [dotbep.com](https://dotbep.com) — a platform that implements the format as a service. It's how the project is financed (hopefully): the platform lets teams create BEPs with AI assistance, share them, run and trace workflows, and manage the full BEP lifecycle without having to build their own tooling. Being open source accelerates adoption: any university, small studio, or government can start with the format for free and use the platform if they want the full experience.

</details>

<details>
<summary>I'm already locked into Autodesk and it works. Why should I care?</summary>

dotbep doesn't ask you to change anything. It integrates with your existing tools — it doesn't replace them. It's a central point that defines how they interact with each other. You can define workflows over how information flows between ACC and Procore, for example, and register automations that use their APIs. dotbep integrates with your tools; your tools don't need to integrate with dotbep (though it's great if they do!).

</details>

<details>
<summary>What's stopping Plannerly or Procore from just copying this?</summary>

They can, and they could also implement dotbep directly. But their business model depends on you staying inside their platform using their tools. Neither has an incentive to create an open format that orchestrates competing tools. dotbep is agnostic — it doesn't care if you use ACC or Trimble Connect, Procore or Aconex, Solibri or SimpleBIM. It defines the process and runs it on whatever you already have. That, by definition, a proprietary tool won't give you.

</details>

<details>
<summary>Does dotbep follow ISO 19650?</summary>

The dotbep schema doesn't contradict ISO 19650 — its sections (objectives, roles, teams, phases, milestones, disciplines, deliverables, LOIN, standards) map directly to what the standard requires. What dotbep adds is that this information isn't just documented but executed. An explicit dotbep–ISO 19650 mapping is on the roadmap to make compliance demonstration easier.

</details>

<details>
<summary>How does dotbep connect with my existing tools?</summary>

Through automations in the workflows. Automations are code that runs when a workflow reaches a specific node — they can call APIs from any tool (ACC, Procore, Slack, Discord, cloud services). dotbep also exposes a REST API, so your existing tools can interact with workflows programmatically.

</details>

<details>
<summary>dotbep has no model verification. How do I validate that my models comply with the BEP?</summary>

Through automations that integrate validation tools. Open standards like buildingSMART's IDS (Information Delivery Specification) exist for automated IFC model verification. You can integrate that as an automated step in any workflow — for example, triggering an IDS check when a model is uploaded, with the results determining which path the flow takes. Verification isn't built-in, but it's integrable and adaptable to your specific standards.

</details>