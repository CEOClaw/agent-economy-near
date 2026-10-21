# Architecture Alternatives

**Status:** Evaluation — not a decision
**Updated:** October 21, 2026

---

## The Core Decision

NEAR AI already operates [Agent Market](https://market.near.ai/) with agent listings, paid jobs, payments, disputes, and reputation built in.

The question is not "should we build a marketplace?" — it's "where does dPlaza sit relative to what already exists?"

---

## Option A — Independent NEAR-Native dPlaza Marketplace

**What it is:** dPlaza builds its own agent store, escrow contracts, reputation system, and payment rails on NEAR — parallel to NEAR Agent Market.

**Pros:**
- Full product ownership and control
- Differentiated brand, not a skin on someone else's rails
- Can optimize for our specific use cases (Ohwow, professional services, M&M ecosystem)
- Clean hackathon story: "we built this"

**Cons:**
- Most development work — escrow, reputation, discovery all from scratch
- Competing with NEAR's own product (they're a judge)
- 14 days is tight for production-quality independent infrastructure
- Duplicates solved problems

**Hackathon competitiveness:** Medium — judges may ask "why not use Agent Market?"
**Time to demo:** High effort
**Long-term maintainability:** High ownership, high maintenance burden

---

## Option B — dPlaza Integrated with NEAR Agent Market

**What it is:** Ohwow agents and CEOClaw list ON NEAR Agent Market. dPlaza is the discovery and UX layer that routes to NEAR's rails underneath.

**Pros:**
- Fastest path to demo — most infrastructure already exists
- NEAR judges will love seeing their own product used well
- Ohwow agents get immediate discoverability in NEAR ecosystem
- Focus energy on the product layer, not plumbing

**Cons:**
- Less differentiation — we're an integration, not a product
- Dependent on NEAR Agent Market API and its limitations
- Less compelling as a long-term M&M product story
- "We built on NEAR Agent Market" may read as shallow

**Hackathon competitiveness:** High for Illia/NEAR judges specifically
**Time to demo:** Low effort
**Long-term maintainability:** Dependent on third party

---

## Option C — Hybrid (Recommended Starting Position)

**What it is:** Use NEAR Agent Market for discovery and payment settlement where it fits. Build dPlaza's own layer for: agent storefronts, task specification, objective verification, and the product experience. Own the interface, rent the rails where it makes sense.

**Pros:**
- Best of both — faster than A, more owned than B
- Judges see NEAR ecosystem integration AND original product work
- Ohwow agents can list on both Agent Market AND dPlaza simultaneously
- Escrow can use NEAR's existing contracts where compatible
- Cleaner story: "We built on NEAR, not against it"
- Extensible post-hackathon — swap rails if needed

**Cons:**
- Requires understanding Agent Market API thoroughly before Nov 1 (pre-work)
- Some architectural complexity at the integration boundary
- Need to define clearly what dPlaza owns vs. delegates

**Hackathon competitiveness:** Highest — shows ecosystem understanding AND original contribution
**Time to demo:** Medium effort
**Long-term maintainability:** Good — own the parts that matter, use proven infra for the rest

---

## Comparison Matrix

| Dimension | A — Independent | B — Integrated | C — Hybrid |
|-----------|----------------|----------------|------------|
| Dev effort | High | Low | Medium |
| NEAR judge appeal | Medium | High | Highest |
| Product differentiation | High | Low | Medium-High |
| Post-hackathon value | High | Low | High |
| Risk of failure in 14 days | High | Low | Medium |
| Ohwow agent compatibility | Build from scratch | Easiest | Good |
| M&M product ownership | Full | Minimal | Strong |

---

## Pre-Decision Research Required

Before committing to any option, validate:

1. **What does NEAR Agent Market's API actually support?** (listings, payments, disputes, reputation endpoints)
2. **Can Ohwow agents be listed there today?** What's the integration surface?
3. **What does NEAR Agent Market lack** that dPlaza's use cases require?
4. **What escrow contracts exist in NEAR ecosystem** we can reuse?
5. **What are the hackathon rules** on pre-existing code and infrastructure?

See [BRAINSTORM.md](BRAINSTORM.md) for full research agenda.

---

## Open Questions for Jesus

- What interface do Ohwow agents currently expose? (API, webhook, MCP?)
- Do they have wallet capability today or would that be net-new?
- What tasks are they best suited to execute for a demo?
- What would be the minimum integration to make them participate as sellers?
- Any constraints on Ohwow agents interacting with external NEAR infrastructure?

*These are questions, not assumptions. Do not modify Ohwow architecture without Jesus's input.*
