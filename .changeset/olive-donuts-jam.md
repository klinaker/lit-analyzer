---
"@jackolope/lit-analyzer": patch
---

Add compatibility recovery for malformed clone templates used directly in `createElement(...)`. When an attributed custom-element opening tag lacks `>` but has a matching explicit closing tag, recover the closing-tag location and remove only attributes produced from it by parse5, preserving real attributes with the same name as the element. This avoids cascading diagnostics without treating the malformed HTML as valid. Plain templates, qualified or aliased helper calls, missing or mismatched end tags, whitespace between `</` and the tag name, and self-closing custom elements retain their diagnostics.
