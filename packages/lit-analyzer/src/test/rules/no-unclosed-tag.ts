import { getDiagnostics } from "../helpers/analyze.js";
import { hasDiagnostic, hasNoDiagnostics } from "../helpers/assert.js";
import { tsTest } from "../helpers/ts-test.js";

tsTest("Report unclosed tags", t => {
	const { diagnostics } = getDiagnostics("html`<div><div></div>`", { rules: { "no-unclosed-tag": true } });
	hasDiagnostic(t, diagnostics, "no-unclosed-tag");
});

tsTest("Don't report void elements", t => {
	const { diagnostics } = getDiagnostics("html`<img>`", { rules: { "no-unclosed-tag": true } });
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Don't report void elements with self closing syntax", t => {
	const { diagnostics } = getDiagnostics("html`<img />`", { rules: { "no-unclosed-tag": true } });
	hasNoDiagnostics(t, diagnostics);
});

// The `<p>` tag will be closed automatically if immediately followed by a lot of other elements,
// including `<div>`.
// Ref: https://html.spec.whatwg.org/multipage/grouping-content.html#the-p-element
tsTest("Report unclosed 'p' tag that was implicitly closed via tag omission", t => {
	const { diagnostics } = getDiagnostics("html`<p><div></div></p>`", { rules: { "no-unclosed-tag": true } });
	hasDiagnostic(t, diagnostics, "no-unclosed-tag");
});

tsTest("Report unclosed 'p' tag that is implicitly closed via tag omission containing text content", t => {
	const { diagnostics } = getDiagnostics("html`<p>Unclosed Content<div></div></p>`", { rules: { "no-unclosed-tag": true } });
	hasDiagnostic(t, diagnostics, "no-unclosed-tag");
});

// Regeression test for https://github.com/runem/lit-analyzer/issues/283
tsTest("Report 'p' tag that is implicitly closed via tag omission containing a space", t => {
	// Note, the browser will parse this case into: `<p> </p><div></div><p></p>` which can be
	// unexpected, but technically means the first `<p>` tag is not explicitly closed.
	const { diagnostics } = getDiagnostics("html`<p> <div></div></p>`", { rules: { "no-unclosed-tag": true } });
	hasDiagnostic(t, diagnostics, "no-unclosed-tag");
});

// Self-closing tags do not exist in HTML. They are only valid in SVG and MathML.
tsTest("Report non-void element using self closing syntax", t => {
	const { diagnostics } = getDiagnostics("html`<p /><div></div>`", { rules: { "no-unclosed-tag": true } });
	hasDiagnostic(t, diagnostics, "no-unclosed-tag");
});

tsTest("Report self closing 'p' tag containing text content", t => {
	const { diagnostics } = getDiagnostics("html`<p />Unclosed Content<div></div>`", { rules: { "no-unclosed-tag": true } });
	hasDiagnostic(t, diagnostics, "no-unclosed-tag");
});

tsTest("Don't report explicit closing 'p' tag containing text content", t => {
	const { diagnostics } = getDiagnostics("html`<p>Unclosed Content</p><div></div>`", { rules: { "no-unclosed-tag": true } });
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Recover explicitly closed custom elements in createElement clone templates", t => {
	const { diagnostics } = getDiagnostics(
		`
declare function createElement(value: unknown): unknown;
declare const map: unknown;
declare const viewId: string;
createElement(html\`
	<legend-group
		.map=\${map}
		.viewId=\${viewId}
	</legend-group>
\`);
createElement(html\`
	<legend-toggle
		.map=\${map}
		.viewId=\${viewId}
	</legend-toggle>
\`);
`
	);
	hasNoDiagnostics(t, diagnostics);
});

// parse5 only misparses the end tag as bogus attributes when the start tag
// carries attributes and has not been closed with '>'. These variants
// therefore exercise the actual recovery path.
tsTest("Recover custom-element end tags with whitespace or uppercase spelling", t => {
	for (const endTag of ["</legend-group >", "</LEGEND-GROUP>"]) {
		const { diagnostics } = getDiagnostics(`
declare function createElement(value: unknown): unknown;
declare const map: unknown;
createElement(html\`<legend-group .map=\${map}
	${endTag}\`);
`);
		hasNoDiagnostics(t, diagnostics);
	}
});

tsTest("Recover custom elements with content following the recovered end tag", t => {
	const { diagnostics } = getDiagnostics(`
declare function createElement(value: unknown): unknown;
declare const map: unknown;
createElement(html\`
	<legend-group .map=\${map}
	</legend-group>
	<div></div>
\`);
`);
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Don't report unknown attributes for the recovered end tag of a registered custom element", t => {
	const { diagnostics } = getDiagnostics(
		`
declare function createElement(value: unknown): unknown;
declare const map: unknown;
class LegendGroup extends HTMLElement {
	map?: unknown;
}
customElements.define("legend-group", LegendGroup);
createElement(html\`
	<legend-group
		.map=\${map}
	</legend-group>
\`);
`
	);
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Keep real attributes named like the recovered custom element", t => {
	const { diagnostics } = getDiagnostics(
		`
declare function createElement(value: unknown): unknown;
class MyElement extends HTMLElement {}
customElements.define("my-element", MyElement);
createElement(html\`<my-element my-element="x" </my-element>\`);
`,
		{ rules: { "no-unknown-attribute": true, "no-unclosed-tag": true } }
	);
	hasDiagnostic(t, diagnostics, "no-unknown-attribute");
});

for (const whitespace of [" ", "\n"]) {
	tsTest(`Report malformed end tags with ${JSON.stringify(whitespace)} after the slash`, t => {
		const { diagnostics } = getDiagnostics(`createElement(html\`<my-element value="x" </${whitespace}my-element>\`);`, {
			rules: { "no-unclosed-tag": true }
		});
		hasDiagnostic(t, diagnostics, "no-unclosed-tag");
	});
}

tsTest("Report end tags with non-HTML whitespace after the name", t => {
	const { diagnostics } = getDiagnostics('createElement(html`<my-element value="x" </my-element\u00a0>`);', {
		rules: { "no-unclosed-tag": true }
	});
	hasDiagnostic(t, diagnostics, "no-unclosed-tag");
});

tsTest("Report custom element in createElement clone template without any end tag", t => {
	const { diagnostics } = getDiagnostics(
		`
declare function createElement(value: unknown): unknown;
declare const map: unknown;
createElement(html\`<legend-group .map=\${map}>\`);
`,
		{ rules: { "no-unclosed-tag": true } }
	);
	hasDiagnostic(t, diagnostics, "no-unclosed-tag");
});

tsTest("Report custom element with a misspelled end tag in createElement clone template", t => {
	const { diagnostics } = getDiagnostics(
		`
declare function createElement(value: unknown): unknown;
declare const map: unknown;
createElement(html\`<legend-group .map=\${map}
	</legend-grop>
\`);
`,
		{ rules: { "no-unclosed-tag": true } }
	);
	hasDiagnostic(t, diagnostics, "no-unclosed-tag");
});

// Recovery is currently scoped to createElement clone templates only.
// This test pins that decision: plain lit templates still report.
tsTest("Report explicitly closed custom element in a plain lit template", t => {
	const { diagnostics } = getDiagnostics(
		`
declare const map: unknown;
html\`<legend-group .map=\${map}
</legend-group>\`;
`,
		{ rules: { "no-unclosed-tag": true } }
	);
	hasDiagnostic(t, diagnostics, "no-unclosed-tag");
});

tsTest("Report genuinely self-closing custom-element input", t => {
	const { diagnostics } = getDiagnostics("html`<legend-group />`", { rules: { "no-unclosed-tag": true } });
	hasDiagnostic(t, diagnostics, "no-unclosed-tag");
});

for (const [name, wrap] of [
	["qualified helper", (template: string) => "helpers.createElement(" + template + ")"],
	["aliased helper", (template: string) => "cloneElement(" + template + ")"],
	["parenthesized argument", (template: string) => "createElement((" + template + "))"]
] as const) {
	tsTest("Report malformed custom elements in " + name, t => {
		const template = 'html`<my-element value="x" </my-element>`';
		const { diagnostics } = getDiagnostics(wrap(template), { rules: { "no-unclosed-tag": true } });
		hasDiagnostic(t, diagnostics, "no-unclosed-tag");
	});
}
