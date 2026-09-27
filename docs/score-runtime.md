# Score pipeline investigation — 1.0.3

Inspected Seanime source commit `2da73d9eb59af15b004ef4e9018ac9db6fff213a`:

- `internal/plugin/anilist.go`: both collection bindings return `*anilist.AnimeCollection` directly to Goja. `customQuery` is available under the existing AniList permission.
- `internal/api/anilist/queries/anime.graphql`: collection entries request `score(format: POINT_100)`. Base anime, detailed recommendation nodes, and relation nodes select `meanScore`.
- `internal/api/anilist/client_gen.go`: entry `Score` is `*float64` with JSON name `score`; the generated accessor is `GetScore()`.
- `internal/extension_repo/mapper.go`: JSON tags map fields; method names lower-case their initial letter, exposing `getScore()`.
- `internal/api/anilist/custom_query.go`: returns the unwrapped GraphQL `data` object, so batched media are at `result.Page.media`, not `result.data.Page.media`.

## Reproduced cause

A standalone Go probe used Seanime's exact Goja dependency, `v0.0.0-20260216154549-8b74ce4618c5`, with a struct containing `Score *float64` and the same field/method mapping. A score of 90 produced:

```json
{"type":"object","finite":false,"primitive":90,"primitiveType":"number","numeric":90,"getterType":"object"}
```

Thus the old `typeof value === "number" && Number.isFinite(value)` parser rejected real pointer-backed scores. `valueOf()` unwraps them safely. The same numeric helper now preserves pointer-backed `meanScore`, episode totals, and durations. Numeric strings are accepted only when entirely numeric; arbitrary objects, booleans, missing/zero user ratings and out-of-range scores are rejected.

Tests cover boxed numbers, primitives, numeric strings, the getter, deduplicated period averages, ranking, source merging, and one-batch final-candidate rating enrichment including caching of genuine null ratings. This reproduces the runtime conversion without accessing a user's private AniList collection. Opt-in live diagnostics are described in the README.
