---
"@jackolope/web-component-analyzer": patch
---

Preserve the setter parameter type when merging getter/setter accessor pairs so property bindings type-check against the write type, and discover attributes declared via a static `observedAttributes` property initialized with an array literal.
