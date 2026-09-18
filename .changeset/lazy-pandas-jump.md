---
"@jackolope/lit-analyzer": patch
---

Improve type checking for attribute and property bindings:

- Recognize branded (opaque) primitive types in attribute bindings instead of reporting them as complex values.
- Resolve generic custom-element member types from the bound value so bindings against components such as `items: T[]` type-check per member and reject values that violate the inferred type argument.
- Keep the original TypeScript types alongside simple types during assignability checks so opaque IDs and structural values compare correctly.
- Accept the HTML `step` attribute's special `any` string value and allow custom converters to accept primitive attribute values for non-primitive property types.
- Treat Lit's `nothing` sentinel as removing the part instead of reporting it as an incompatible value.
- Reuse shared and recursive type graphs to prevent generic substitution hangs, distinguish shadowed type parameters, and retain every source-union member during nullable inference.
- Scope native types, converted types, and binding results to the current TypeScript checker so diagnostics, completions, and quick info refresh after edits.
