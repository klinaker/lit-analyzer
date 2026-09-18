import { getDiagnostics } from "../helpers/analyze.js";
import { hasDiagnostic, hasNoDiagnostics } from "../helpers/assert.js";
import { makeElement } from "../helpers/generate-test-file.js";
import { tsTest } from "../helpers/ts-test.js";

tsTest("Complex types are not assignable using an attribute binding", t => {
	const { diagnostics } = getDiagnostics('html`<input placeholder="${{foo: "bar"}}" />`');
	hasDiagnostic(t, diagnostics, "no-complex-attribute-binding");
});

tsTest("Complex types are assignable using a property binding", t => {
	const { diagnostics } = getDiagnostics('html`<input .onclick="${() => {}}" />`');
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Primitives are not assignable to complex type using an attribute binding", t => {
	const { diagnostics } = getDiagnostics([makeElement({ properties: ["complex = {foo: string}"] }), 'html`<my-element complex="bar"></my-element>`']);
	hasDiagnostic(t, diagnostics, "no-complex-attribute-binding");
});

tsTest("Complex types are assignable using property binding", t => {
	const { diagnostics } = getDiagnostics([
		makeElement({ properties: ["complex = {foo: string}"] }),
		'html`<my-element .complex="${{foo: "bar"}}"></my-element>`'
	]);
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Don't check for the assignability of complex types in attribute bindings if the type is a custom lit directive", t => {
	const { diagnostics } = getDiagnostics(
		'type Part = {}; type ifExists = (val: any) => (part: Part) => void; html`<input maxlength="${ifExists(123)}" />`'
	);
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Ignore element expressions", t => {
	const { diagnostics } = getDiagnostics("html`<input ${{x: 1}} />`", { rules: { "no-incompatible-type-binding": false } });
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Complex types are assignable to attributes using converters", t => {
	const { diagnostics } = getDiagnostics(
		[
			makeElement({
				properties: [
					`@property({ converter: {
						fromAttribute(str) { return str.split(','); },
						toAttribute(arr) { return arr.join(','); }
					}})
					complex: string[];`
				],
				fullPropertyDeclaration: true
			}),
			'html`<my-element complex="foo,bar"></my-element>`'
		],
		{
			rules: {
				"no-incompatible-type-binding": "off"
			}
		}
	);
	hasNoDiagnostics(t, diagnostics);
});

const opaqueType = `
type Opaque<K, T> = T & {
	readonly __OPAQUE_TYPE_IDENTIFIER__: K;
};
`;

const convertedElement = `
declare function property(options?: unknown): any;
class ConvertedElement extends HTMLElement {
	@property({ converter: {} }) value!: { nested: string };
}
customElements.define("converted-element", ConvertedElement);
`;

tsTest("Opaque string types are assignable using an attribute binding", t => {
	const { diagnostics } = getDiagnostics(`${opaqueType}
declare const value: Opaque<"Id", string>;
html\`<input value="\${value}" />\``);
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Opaque string types are assignable inside a constrained generic", t => {
	const { diagnostics } = getDiagnostics(`${opaqueType}
function render<T extends string>(value: Opaque<"Id", T>) {
	html\`<input value="\${value}" />\`;
}`);
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Object-constrained generic types are not assignable using an attribute binding", t => {
	const { diagnostics } = getDiagnostics(
		`function render<T extends object>(value: T) {
	html\`<input value="\${value}" />\`;
}`,
		{ rules: { "no-incompatible-type-binding": false } }
	);
	hasDiagnostic(t, diagnostics, "no-complex-attribute-binding");
});

tsTest("A union of opaque string types is assignable using an attribute binding", t => {
	const { diagnostics } = getDiagnostics(`${opaqueType}
type EntityId = Opaque<"RecordId", string> | Opaque<"EntityId", string>;
declare const value: EntityId;
html\`<input data-entity-id=\${value} />\``);
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Opaque numeric types are assignable using an attribute binding", t => {
	const { diagnostics } = getDiagnostics(`${opaqueType}
declare const value: Opaque<"Count", number>;
html\`<input data-count="\${value}" />\``);
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Opaque primitive types are assignable to an attribute target", t => {
	const { diagnostics } = getDiagnostics(
		`${opaqueType}
class MyElement extends HTMLElement {
	@property() opaque!: Opaque<"Id", string>;
}
customElements.define("my-element", MyElement);
html\`<my-element opaque="value"></my-element>\``,
		{ rules: { "no-incompatible-property-type": false, "no-incompatible-type-binding": false } }
	);
	hasNoDiagnostics(t, diagnostics);
});

tsTest("An object intersection is still not assignable using an attribute binding", t => {
	const { diagnostics } = getDiagnostics(`
type Complex = { foo: string } & { bar: string };
const value: Complex = { foo: "", bar: "" };
html\`<input data-value="\${value}" />\``);
	hasDiagnostic(t, diagnostics, "no-complex-attribute-binding");
});

tsTest("A union containing an object is still not assignable using an attribute binding", t => {
	const { diagnostics } = getDiagnostics(`${opaqueType}
type Value = Opaque<"Id", string> | { foo: string };
declare const value: Value;
html\`<input data-value="\${value}" />\``);
	hasDiagnostic(t, diagnostics, "no-complex-attribute-binding");
});

tsTest("Custom converters allow primitive values for non-primitive attribute targets", t => {
	const { diagnostics } = getDiagnostics(`${convertedElement}
declare const value: string;
html\`<converted-element value="encoded"></converted-element>\`;
html\`<converted-element value="\${value}"></converted-element>\`;`);
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Non-converted non-primitive attribute targets remain rejected", t => {
	const { diagnostics } = getDiagnostics(
		`
declare function property(options?: unknown): any;
class NonConvertedElement extends HTMLElement {
	@property() value!: { nested: string };
}
customElements.define("non-converted-element", NonConvertedElement);
html\`<non-converted-element value="encoded"></non-converted-element>\`;
`,
		{
			rules: {
				"no-incompatible-property-type": false,
				"no-incompatible-type-binding": false
			}
		}
	);
	hasDiagnostic(t, diagnostics, "no-complex-attribute-binding");
});

tsTest("Custom converters do not allow complex values as attribute sources", t => {
	const { diagnostics } = getDiagnostics(
		`${convertedElement}
declare const value: { nested: string };
html\`<converted-element value="\${value}"></converted-element>\`;`,
		{
			rules: { "no-incompatible-type-binding": false }
		}
	);
	hasDiagnostic(t, diagnostics, "no-complex-attribute-binding");
});

tsTest("Custom converters do not suppress nullable attribute diagnostics", t => {
	const { diagnostics } = getDiagnostics(
		`${convertedElement}
declare const value: { nested: string } | undefined;
html\`<converted-element value="\${value}"></converted-element>\`;`,
		{ rules: { "no-nullable-attribute-binding": true } }
	);
	hasDiagnostic(t, diagnostics, "no-nullable-attribute-binding");
});

tsTest("Custom converters do not suppress boolean binding diagnostics", t => {
	const { diagnostics } = getDiagnostics(`${convertedElement}
html\`<converted-element ?value="\${true}"></converted-element>\`;`);
	hasDiagnostic(t, diagnostics, "no-incompatible-type-binding");
});

tsTest("Custom converters do not suppress property binding diagnostics", t => {
	const { diagnostics } = getDiagnostics(
		`${convertedElement}
html\`<converted-element .value="\${"encoded"}"></converted-element>\`;`,
		{
			rules: { "no-incompatible-property-type": false }
		}
	);
	hasDiagnostic(t, diagnostics, "no-incompatible-type-binding");
});

tsTest("Custom converters do not suppress security-system diagnostics", t => {
	const { diagnostics } = getDiagnostics(
		`
declare function property(options?: unknown): any;
class StyledElement extends HTMLElement {
	@property({ converter: {} }) style!: { nested: string };
}
customElements.define("styled-element", StyledElement);
declare const value: { nested: string };
html\`<styled-element style="\${value}"></styled-element>\`;
`,
		{ securitySystem: "ClosureSafeTypes" }
	);
	hasDiagnostic(t, diagnostics, "no-complex-attribute-binding");
});
