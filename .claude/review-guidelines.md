# Code Review Guidelines

Adapted from Google's TypeScript Style Guide, and filtered to what applies
to this codebase: a standalone, published TypeScript library (no DOM, no
decorators) that does real network I/O against DoH/RDAP/WHOIS services and
ships both a library entry point and a CLI (`bin/domainstat`).

### Public API stability

This package is published to npm and consumed by other repos in this
organization (and potentially by third parties). Its public surface is
exactly what `src/index.ts` re-exports, plus the CLI's flags/output
contract in `src/cli.ts`.

- Treat any change to `src/index.ts`'s exports (new export, removed export,
  changed signature, changed return shape) as a breaking-change candidate —
  flag it explicitly, even if it looks minor.
- Treat any change to the CLI's flags, output format, or exit codes the
  same way — scripts may depend on them.
- Internal helpers (`src/adapters/**`, `src/tldAdapters/**`,
  `src/rdap-parser.ts`, `src/validator.ts`) are free to change shape as
  long as the public surface and observable behavior are preserved.
- A function or type does not need `export` just because it might be useful
  elsewhere later — only export what `index.ts` re-exports or what tests
  need.

### Network I/O

This library's entire purpose is querying live DoH/RDAP/WHOIS services, so
unlike most codebases, un-mocked network calls in tests are the deliberate
house style here, not an oversight.

- Every adapter (`adapters/*.ts`) must handle timeouts, non-2xx responses,
  and malformed responses without throwing an unhandled rejection into the
  caller — surface a typed `AdapterError`/`AdapterResponse` instead.
- Be deliberate about concurrency and rate limiting (see `MAX_CONCURRENCY`,
  `DEFAULT_STAGGER_DELAY` in `src/index.ts`) — a change that removes or
  weakens these without justification risks getting the library's callers
  rate-limited or IP-banned by upstream registries.
- Flag new external endpoints/hosts introduced without an accompanying
  adapter-level error-handling story.

### Type system

**No nullable/undefined type aliases.** A type alias must not include `|null`
or `|undefined` in its own definition; add that at the point of use instead.

```typescript
// Bad
type CoffeeResponse = Latte | Americano | undefined;
getLatte(): CoffeeResponse { ... }

// Good
type CoffeeResponse = Latte | Americano;
getLatte(): CoffeeResponse | undefined { ... }
```

- **Prefer optional fields over `|undefined` properties**: `foo?: string`
  over `foo: string | undefined`.
- **Explicit types when inference isn't obvious** from the initializer.
- **Interfaces for structural/object shapes**, not classes, when there's no
  behavior to attach.
- **Simplest type construct wins.** Prefer a plain interface extension or
  repetitive explicit type over a clever mapped/conditional type.
- **Index signatures need a meaningful key label**
  (`{[domain: string]: DomainStatus}`, not `{[key: string]: DomainStatus}`).
- **Avoid return-type-only generics** — if the generic can't be inferred
  from an argument, every caller must write it out and can get it wrong
  silently.

### Coercion & comparisons

- Use `Number()` to parse, and check the result for `NaN` explicitly.
- Never coerce an enum value to boolean implicitly; compare against a real
  member.

### Classes

- Prefer module-local functions over `private static` methods.
- Don't reach through visibility with bracket access (`obj['privateField']`).
- A getter must be a pure function — no observable side effects.
- Field shape must be stable after the constructor runs.
- Parameter properties (`constructor(private readonly foo: Foo) {}`) are
  fine and preferred over separate field declarations plus manual
  assignment.

### Functions & `this`

- Prefer function declarations for named, module-level functions; arrow
  functions for callbacks and anything that needs lexical `this`.
- Avoid `.bind(this)`; prefer an arrow function instead.
- Prefer small functions and use composition.

### Exceptions & Errors

- When catching, assume the thrown value is an `Error` instance unless an
  API is conclusively documented to throw something else — this matters
  especially in adapter code catching `fetch`/DNS failures.
- An empty `catch` block is almost never correct — if you really mean to
  swallow the error (e.g. falling back to the next adapter source), add a
  comment explaining why.
- Throw only `Error` or subtypes of `Error`. Do not throw primitives.
- When rethrowing an error, propagate the original error through `{cause}`.
- Keep new adapter errors consistent with the existing `AdapterError`
  shape rather than inventing a parallel error convention.

### Try blocks

- Keep the code inside a `try` focused on the statements that can actually
  throw; move everything else outside it.

### Comments & JSDoc

- `/** JSDoc */` for anything documenting an API surface; `//` line
  comments for implementation notes.
- No boxed/asterisk-bordered comment blocks.
- A good comment describes *why*, not *what* the code is doing.

### Naming

- No ambiguous abbreviations, and don't abbreviate by deleting internal
  letters (`indx` for `index`) — acronym-style abbreviation (`id`, `url`)
  is fine.
- Treat acronyms as whole words in identifiers (`tldInfo`, not `TLDInfo`).

### Testing

- Real implementations against live DoH/RDAP/WHOIS endpoints are the norm
  here (see `tests/run.test.js`) — don't introduce mocks in place of that
  pattern without a strong reason (e.g. a specific malformed-response case
  no live service will reliably reproduce).
- Enforce proper test file naming and location, consistent with
  `tests/*.test.js`.
- Avoid starting test descriptions with "should"; describe the behavior
  directly using an active verb.
- Test behaviors, not implementations — focus on the public API and
  observable adapter outcomes (status, source, error), not internal call
  sequencing.
- Do not override the type system to reach into internals from a test.

### Commits

- A commit should be one self-contained change, and its description should
  reflect the scope of changed files.
- Prefer small commits over large ones.
- If a commit contains multiple disparate changes, suggest breaking it up
  into smaller focused commits.

### General change-level guides

- While uncommon, certain changes may warrant updates to `README.md`;
  report this if applicable. `README.md` should be more correct and
  concise than complete.
- Be wary of adding new dependencies to minimize supply-chain risks — this
  package intentionally keeps its dependency footprint minimal (`tldts` is
  the only runtime dependency today). If a dependency is minor or can be
  trivially inlined, inline it.
- Review every line of the change diligently — you are the final gate of
  quality, maintainability, and security for this code.
- If, in the course of review, you identify an issue unrelated to the
  change under review, report it without blocking the commit.
