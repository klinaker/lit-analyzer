import { getDiagnostics } from "../helpers/analyze.js";
import { hasDiagnostic, hasNoDiagnostics } from "../helpers/assert.js";
import { makeElement } from "../helpers/generate-test-file.js";
import { tsTest } from "../helpers/ts-test.js";

const lit2DirectiveSetup = `
	export class Directive { }

	export interface DirectiveClass {
		new (part: PartInfo): Directive;
	}

	export type DirectiveParameters<C extends Directive> = Parameters<C['render']>;

	// TODO (justinfagnani): ts-simple-type has a bug, so I remove the generic
	export interface DirectiveResult {
		values: unknown[];
	}

	export const directive = <C extends DirectiveClass>(c: C) => (...values: DirectiveParameters<InstanceType<C>>): DirectiveResult => ({
    ['_$litDirective$']: c,
    values,
  });
`;

tsTest("Element binding: non-directive not allowed", t => {
	const { diagnostics } = getDiagnostics("html`<input ${123} />`");
	hasDiagnostic(t, diagnostics, "no-incompatible-type-binding");
});

tsTest("Element binding: lit-html 1 directives are not allowed", t => {
	const { diagnostics } = getDiagnostics(`
export interface Part { }

const ifDefined: (value: unknown) => (part: Part) => void;

html\`<input \${ifDefined(10)} />\`
	`);
	hasDiagnostic(t, diagnostics, "no-incompatible-type-binding");
});

tsTest("Element binding: Lit 2 directives are allowed", t => {
	const { diagnostics } = getDiagnostics(`

${lit2DirectiveSetup}

class MyDirective extends Directive {
  render(): number {
		return 42;
	}
}
const myDirective = directive(MyDirective);

html\`<input \${myDirective()} />\`
	`);
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Element binding: any allowed", t => {
	const { diagnostics } = getDiagnostics(`
const ifDefined: any;

html\`<input \${ifDefined(10)} />\`
	`);
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Attribute binding: 'no-incompatible-type-binding' is not emitted when the rule is turned off", t => {
	const { diagnostics } = getDiagnostics('html`<input maxlength="foo" />`', { rules: { "no-incompatible-type-binding": "off" } });
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Attribute binding: String literal (a number) is assignable to number", t => {
	const { diagnostics } = getDiagnostics('html`<input maxlength="123" />`');
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Attribute binding: String literal (not a number) is not assignable to number", t => {
	const { diagnostics } = getDiagnostics('html`<input maxlength="foo" />`');
	hasDiagnostic(t, diagnostics, "no-incompatible-type-binding");
});

tsTest("Attribute binding: Number type expression is assignable to number", t => {
	const { diagnostics } = getDiagnostics('html`<input maxlength="${123}" />`');
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Attribute binding: String literal type expression (a number) is assignable to number", t => {
	const { diagnostics } = getDiagnostics('html`<input maxlength="${"123"}" />`');
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Attribute binding: String literal type expression (not a number) is not assignable to number", t => {
	const { diagnostics } = getDiagnostics('html`<input maxlength="${"foo"}" />`');
	hasDiagnostic(t, diagnostics, "no-incompatible-type-binding");
});

tsTest("Attribute binding: String type expression is not assignable to number", t => {
	const { diagnostics } = getDiagnostics('html`<input maxlength="${{} as string}" />`');
	hasDiagnostic(t, diagnostics, "no-incompatible-type-binding");
});

tsTest("Attribute binding: Expression of type union with two string literals (numbers) is assignable to number", t => {
	const { diagnostics } = getDiagnostics('html`<input maxlength="${{} as "123" | "321"}" />`');
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Attribute binding: Expression of type union with two string literals (one not being a number) is not assignable to number", t => {
	const { diagnostics } = getDiagnostics('html`<input maxlength="${{} as "123" | "foo"}" />`');
	hasDiagnostic(t, diagnostics, "no-incompatible-type-binding");
});

tsTest("Attribute binding: String literal is assignable to string", t => {
	const { diagnostics } = getDiagnostics('html`<input placeholder="foo" />`');
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Attribute binding: String literal (a number) is assignable to string", t => {
	const { diagnostics } = getDiagnostics('html`<input placeholder="123" />`');
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Attribute binding: String literal expression is assignable to string", t => {
	const { diagnostics } = getDiagnostics('html`<input placeholder="${"foo"}" />`');
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Attribute binding: Number type expression is assignable to string", t => {
	const { diagnostics } = getDiagnostics('html`<input placeholder="${123}" />`');
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Attribute binding: String literal (0 length) is assignable to number", t => {
	const { diagnostics } = getDiagnostics('html`<input maxlength="" />`');
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Attribute binding: String literal (0 length) is assignable to string", t => {
	const { diagnostics } = getDiagnostics('html`<input placeholder="" />`');
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Attribute binding: String literal (0 length) is assignable to boolean", t => {
	const { diagnostics } = getDiagnostics('html`<input required="" />`');
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Attribute binding: String literal is not assignable to boolean", t => {
	const { diagnostics } = getDiagnostics('html`<input required="foo" />`', { rules: { "no-boolean-in-attribute-binding": false } });
	hasDiagnostic(t, diagnostics, "no-incompatible-type-binding");
});

tsTest("Attribute binding: Number type expression is not assignable to boolean", t => {
	const { diagnostics } = getDiagnostics('html`<input required="${123}" />`', { rules: { "no-boolean-in-attribute-binding": false } });
	hasDiagnostic(t, diagnostics, "no-incompatible-type-binding");
});

tsTest("Attribute binding: Boolean attribute is assignable to boolean", t => {
	const { diagnostics } = getDiagnostics("html`<input required />`");
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Attribute binding: Boolean type expression is assignable to 'true'|'false'", t => {
	const { diagnostics } = getDiagnostics('let b = true; html`<input aria-expanded="${b}" />`', {
		rules: { "no-boolean-in-attribute-binding": false }
	});
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Attribute binding: Boolean type expression (true) is assignable to 'true'|'false'", t => {
	const { diagnostics } = getDiagnostics('html`<input aria-expanded="${true}" />`', { rules: { "no-boolean-in-attribute-binding": false } });
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Attribute binding: Boolean type expression (false) is assignable to 'true'|'false'", t => {
	const { diagnostics } = getDiagnostics('html`<input aria-expanded="${false}" />`', { rules: { "no-boolean-in-attribute-binding": false } });
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Attribute binding: Union of 'string | Directive' type expression is assignable to string", t => {
	const { diagnostics } = getDiagnostics('type DirectiveFn = {}; html`<input placeholder="${{} as string | DirectiveFn}" />`');
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Boolean binding: Empty string literal is not assignable in a boolean attribute binding", t => {
	const { diagnostics } = getDiagnostics('html`<input ?required="${""}" />`');
	hasDiagnostic(t, diagnostics, "no-incompatible-type-binding");
});

tsTest("Boolean binding: Boolean is assignable in a boolean attribute binding", t => {
	const { diagnostics } = getDiagnostics('html`<input ?required="${true}" />`');
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Boolean binding: String is not assignable in boolean attribute binding", t => {
	const { diagnostics } = getDiagnostics('html`<input ?required="${{} as string}" />`');
	hasDiagnostic(t, diagnostics, "no-incompatible-type-binding");
});

tsTest("Property binding: String literal type expression is not assignable to boolean property", t => {
	const { diagnostics } = getDiagnostics([makeElement({ properties: ["required = false"] }), 'html`<my-element .required="${"foo"}"></my-element>`']);
	hasDiagnostic(t, diagnostics, "no-incompatible-type-binding");
});

tsTest("Property binding: String literal (0 length) type expression is not assignable to boolean property", t => {
	const { diagnostics } = getDiagnostics([makeElement({ properties: ["required = false"] }), 'html`<my-element .required="${""}"></my-element>`']);
	hasDiagnostic(t, diagnostics, "no-incompatible-type-binding");
});

tsTest("Property binding: Number type expression is not assignable to boolean property", t => {
	const { diagnostics } = getDiagnostics([makeElement({ properties: ["required = false"] }), 'html`<my-element .required="${123}"></my-element>`']);
	hasDiagnostic(t, diagnostics, "no-incompatible-type-binding");
});

tsTest("Property binding: Boolean type expression is not assignable to boolean property", t => {
	const { diagnostics } = getDiagnostics([makeElement({ properties: ["required = false"] }), 'html`<my-element .required="${true}"></my-element>`']);
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Property binding: Type expression correctly reports a type union that is only partially met", t => {
	const { diagnostics } = getDiagnostics([
		makeElement({ properties: ["foo: number = 0"] }),
		'html`<my-element .foo="${"bar" as string | number}"></my-element>`'
	]);
	hasDiagnostic(t, diagnostics, "no-incompatible-type-binding");
});

tsTest("Attribute binding: 'ifDefined' directive correctly removes 'undefined' from the type union 1", t => {
	const { diagnostics } = getDiagnostics('type ifDefined = Function; html`<input maxlength="${ifDefined({} as number | undefined)}" />`');
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Attribute binding: 'ifDefined' directive correctly removes 'undefined' from the type union 2", t => {
	const { diagnostics } = getDiagnostics('type ifDefined = Function; html`<input maxlength="${ifDefined({} as number | string | undefined)}" />`');
	hasDiagnostic(t, diagnostics, "no-incompatible-type-binding");
});

tsTest("Attribute binding: 'guard' directive correctly infers correct type from the callback 1", t => {
	const { diagnostics } = getDiagnostics('type guard = Function; html`<img src="${guard([""], () => "nothing.png")}" />`');
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Attribute binding: 'guard' directive correctly infers correct type from the callback 2", t => {
	const { diagnostics } = getDiagnostics('type guard = Function; html`<input maxlength="${guard([""], () => ({} as string | number))}" />`');
	hasDiagnostic(t, diagnostics, "no-incompatible-type-binding");
});

tsTest("Attribute binding: using custom directive won't result in diagnostics", t => {
	const { diagnostics } = getDiagnostics(`
export interface Part { }

const ifDefined: (value: unknown) => (part: Part) => void

const ifExists = (value: any) => ifDefined(value === null ? undefined : value);

html\`<input step="\${ifExists(10)}" />\`
	`);
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Attribute binding: the role attribute is correctly type checked when given valid items", t => {
	const { diagnostics } = getDiagnostics(`html\`<div role="button listitem"></div>\`
	`);

	hasNoDiagnostics(t, diagnostics);
});

tsTest("Attribute binding: the role attribute is correctly type checked when given invalid items", t => {
	const { diagnostics } = getDiagnostics(`html\`<div role="button foo"></div>\`
	`);

	hasDiagnostic(t, diagnostics, "no-incompatible-type-binding");
});

function makeCustomDirective(name = "myDirective") {
	return `
type DirectiveFn<_T = unknown> = (part: Part) => void;
const ${name} = {} as (<T>(arg: T) => DirectiveFn<T>);
`;
}

tsTest("Attribute binding: correctly infers type of generic directive function", t => {
	const { diagnostics } = getDiagnostics(`${makeCustomDirective("myDirective")}
html\`<input step="\${myDirective(10)}" /> \`
	`);

	hasNoDiagnostics(t, diagnostics);
});

tsTest("Attribute binding: correctly infers type of generic directive function and fails type checking", t => {
	const { diagnostics } = getDiagnostics(`${makeCustomDirective("myDirective")}
html\`<input step="\${myDirective("foo")}" /> \`
	`);

	hasDiagnostic(t, diagnostics, "no-incompatible-type-binding");
});

tsTest("Attribute binding: the target attribute is correctly type checked when given a string", t => {
	const { diagnostics } = getDiagnostics(`html\`<a target="custom-target"></a>\`
	`);

	hasNoDiagnostics(t, diagnostics);
});

tsTest("Strings are assignable to types with converters", t => {
	const { diagnostics } = getDiagnostics([
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
	]);
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Attribute binding: any symbols are ignored on type checking", t => {
	const { diagnostics } = getDiagnostics(`
declare const value: boolean | unique symbol;
html\`<div aria-expanded=\${userInput}></div>\`
	`);

	hasNoDiagnostics(t, diagnostics);
});

tsTest("Attribute binding: symbols are not treated as any type", t => {
	const { diagnostics } = getDiagnostics(`
declare const value: "invalid" | unique symbol;
html\`<div aria-expanded=\${value}></div>\`
	`);

	hasDiagnostic(t, diagnostics, "no-incompatible-type-binding");
});

tsTest("Attribute binding: lit's nothing is ignored on type checking when returned by a function", t => {
	const { diagnostics } = getDiagnostics(`
declare const nothing: unique symbol;
function customIfDef<T>(value: T | null | undefined): T | typeof nothing {
	return value ?? nothing;
}
declare const value: boolean | null;
html\`<div aria-expanded=\${customIfDef(value)}></div>\`
	`);

	hasNoDiagnostics(t, diagnostics);
});

tsTest("Attribute binding: the native step attribute accepts the special any value", t => {
	const { diagnostics } = getDiagnostics('html`<input step="any" />`');
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Attribute binding: the native step attribute accepts an expression containing the special any value", t => {
	const { diagnostics } = getDiagnostics('html`<input step="${"any"}" />`');
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Attribute binding: ifDefined preserves the native step union containing any", t => {
	const { diagnostics } = getDiagnostics(`
declare function ifDefined<T>(value: T | undefined): T | undefined;
declare const step: number | "any" | undefined;
html\`<input step="\${ifDefined(step)}" />\``);
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Property binding: the native input step API remains string-valued", t => {
	const { diagnostics } = getDiagnostics('html`<input .step="${"any"}" />`');
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Attribute binding: custom numeric members do not inherit the native step-any exception", t => {
	const { diagnostics } = getDiagnostics(`
declare function property(options?: unknown): any;
class CustomElement extends HTMLElement {
	@property({ type: Number }) step!: number;
}
customElements.define("custom-element", CustomElement);
html\`<custom-element step="any"></custom-element>\`;
`);
	hasDiagnostic(t, diagnostics, "no-incompatible-type-binding");
});

tsTest("Attribute binding: arbitrary strings are not accepted as step any", t => {
	const { diagnostics } = getDiagnostics('html`<input step="foo" />`');
	hasDiagnostic(t, diagnostics, "no-incompatible-type-binding");
});

tsTest("Attribute binding: the nothing sentinel removes a string-valued attribute", t => {
	const { diagnostics } = getDiagnostics('declare const nothing: unique symbol; html`<input title="${nothing}" />`');
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Property binding: the nothing sentinel removes a string-valued property", t => {
	const { diagnostics } = getDiagnostics([
		makeElement({ properties: ['title = ""', 'summaryContent = ""'] }),
		'declare const nothing: unique symbol; html`<my-element .title="${nothing}" .summaryContent="${nothing}"></my-element>`'
	]);
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Attribute binding: compound expressions containing the nothing sentinel are removable", t => {
	const { diagnostics } = getDiagnostics(`
declare const nothing: unique symbol;
declare const style: string | undefined;
html\`<input style="\${style ?? nothing}" aria-expanded="\${true ? true : nothing}" />\``);
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Attribute binding: the nothing sentinel is valid for style removal", t => {
	const { diagnostics } = getDiagnostics('declare const nothing: unique symbol; html`<input style="${nothing}" />`');
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Attribute binding: the nothing sentinel is valid for optional numeric values", t => {
	const { diagnostics } = getDiagnostics('declare const nothing: unique symbol; html`<input maxlength="${nothing}" />`');
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Attribute binding: arbitrary unique symbols are not treated as the nothing sentinel", t => {
	const { diagnostics } = getDiagnostics('declare const other: unique symbol; html`<input title="${other}" />`');
	hasDiagnostic(t, diagnostics, "no-incompatible-type-binding");
});

tsTest("Attribute binding: a union containing nothing still validates its other members", t => {
	const { diagnostics } = getDiagnostics(
		'declare const nothing: unique symbol; declare const value: string | typeof nothing; html`<input maxlength="${value}" />`'
	);
	hasDiagnostic(t, diagnostics, "no-incompatible-type-binding");
});

tsTest("Property binding: merged native declarations accept a value from a later declaration", t => {
	const { diagnostics } = getDiagnostics('html`<input .part="${"foo"}"></input>`');
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Property binding: writable accessor pairs accept the setter type", t => {
	const { diagnostics } = getDiagnostics(
		`
		class Tabs extends HTMLElement {
			get selected(): HTMLElement {
				return this;
			}

			set selected(value: HTMLElement | string) {}
		}
		customElements.define("x-tabs", Tabs);
		html\`<x-tabs .selected="\${"foo"}"></x-tabs>\`;
	`,
		{ rules: { "no-incompatible-property-type": false } }
	);

	hasNoDiagnostics(t, diagnostics);
});

tsTest("Property binding: structurally identical opaque aliases remain assignable across files", t => {
	const { diagnostics } = getDiagnostics(
		[
			{
				fileName: "opaque-types.ts",
				text: `
export type Opaque<K, T> = T & { readonly __opaque__: K };
export type RecordId = Opaque<"RecordId", string>;
export type EntityId = RecordId | Opaque<"EntityId", string>;
export type OtherId = Opaque<"Other", string>;
`
			},
			{
				fileName: "layer-element.ts",
				text: `
import type { EntityId } from "./opaque-types";
export class LayerElement extends HTMLElement {
	#entityId?: EntityId;
	set entityId(value: EntityId) { this.#entityId = value; }
	get entityId() { return this.#entityId!; }
}
customElements.define("layer-element", LayerElement);
`
			},
			{
				fileName: "opaque-use.ts",
				entry: true,
				text: `
import type { EntityId, OtherId } from "./opaque-types";
declare const entityId: EntityId;
declare const otherId: OtherId;
html\`<layer-element .entityId="\${entityId}"></layer-element>\`;
html\`<layer-element .entityId="\${otherId}"></layer-element>\`;
`
			}
		],
		{ rules: { "no-incompatible-property-type": false } }
	);
	hasDiagnostic(t, diagnostics, "no-incompatible-type-binding");
});

tsTest("Attribute binding: structurally identical opaque aliases remain assignable across files", t => {
	const { diagnostics } = getDiagnostics(
		[
			{
				fileName: "opaque-types.ts",
				text: `
export type Opaque<K, T> = T & { readonly __opaque__: K };
export type RecordId = Opaque<"RecordId", string>;
export type EntityId = RecordId | Opaque<"EntityId", string>;
export type OtherId = Opaque<"Other", string>;
`
			},
			{
				fileName: "layer-element.ts",
				text: `
import type { EntityId } from "./opaque-types";
/** @attr entityId */
export class LayerElement extends HTMLElement {
	get entityId(): EntityId { return "" as EntityId; }
}
customElements.define("layer-element", LayerElement);
`
			},
			{
				fileName: "opaque-use.ts",
				entry: true,
				text: `
import type { EntityId, OtherId } from "./opaque-types";
declare const entityId: EntityId;
declare const otherId: OtherId;
html\`<layer-element entityId="\${entityId}"></layer-element>\`;
html\`<layer-element entityId="\${otherId}"></layer-element>\`;
`
			}
		],
		{ rules: { "no-incompatible-property-type": false } }
	);
	hasDiagnostic(t, diagnostics, "no-incompatible-type-binding");
});

tsTest("Property binding: a generic custom element infers T from its items property", t => {
	const diagnostics = getDiagnostics(
		[
			{
				fileName: "generic-types.ts",
				text: `
					export interface Item { id: string; }
				`
			},
			{
				fileName: "generic-element.ts",
				text: `
					import type { Item } from "./generic-types";
					export class GenericElement<T extends Item> extends HTMLElement {
						items!: T[];
						templateProvider!: (item: T) => HTMLElement;
					}
					customElements.define("generic-element", GenericElement);
				`
			},
			{
				fileName: "generic-use.ts",
				entry: true,
				text: `
					import "./generic-element";
					import type { Item } from "./generic-types";
					declare const items: Item[];
					declare const templateProvider: (item: Item) => HTMLDivElement;
					html\x60<generic-element .items="\${items}" .templateProvider="\${templateProvider}"></generic-element>\x60;
				`
			}
		],
		{ rules: { "no-incompatible-property-type": false } }
	).diagnostics;
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Property binding: inherited generic members preserve branded array types", t => {
	const diagnostics = getDiagnostics(
		[
			{
				fileName: "attribute-types.ts",
				text: `
export type Opaque<K, T> = T & { readonly __opaque__: K };
export type AttributeId = Opaque<"AttributeId", string>;
`
			},
			{
				fileName: "form-element.ts",
				text: `
export class FormElement<T> extends HTMLElement {
	value!: T;
}
`
			},
			{
				fileName: "attribute-picker.ts",
				text: `
import { FormElement } from "./form-element";
export class AttributePicker<T> extends FormElement<T[]> {}
customElements.define("attribute-picker", AttributePicker);
`
			},
			{
				fileName: "attribute-picker-use.ts",
				entry: true,
				text: `
import "./attribute-picker";
import type { AttributeId } from "./attribute-types";
declare const attributeIds: AttributeId[];
html\x60<attribute-picker .value="\${attributeIds}"></attribute-picker>\x60;
`
			}
		],
		{ rules: { "no-incompatible-property-type": false } }
	).diagnostics;
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Property binding: inherited generic members reject unrelated branded arrays", t => {
	const diagnostics = getDiagnostics(
		[
			{
				fileName: "attribute-types.ts",
				text: `
export type Opaque<K, T> = T & { readonly __opaque__: K };
export type AttributeId = Opaque<"AttributeId", string>;
export type OtherId = Opaque<"OtherId", string>;
`
			},
			{
				fileName: "form-element.ts",
				text: `
export class FormElement<T> extends HTMLElement {
	ids!: T;
	value!: T;
}
`
			},
			{
				fileName: "attribute-picker.ts",
				text: `
import { FormElement } from "./form-element";
export class AttributePicker<T> extends FormElement<T[]> {}
customElements.define("attribute-picker", AttributePicker);
`
			},
			{
				fileName: "attribute-picker-use.ts",
				entry: true,
				text: `
import "./attribute-picker";
import type { AttributeId, OtherId } from "./attribute-types";
declare const attributeIds: AttributeId[];
declare const otherIds: OtherId[];
html\x60<attribute-picker .ids="\${attributeIds}" .value="\${otherIds}"></attribute-picker>\x60;
`
			}
		],
		{ rules: { "no-incompatible-property-type": false } }
	).diagnostics;
	hasDiagnostic(t, diagnostics, "no-incompatible-type-binding");
});

tsTest("Property binding: generic accessor pairs use the setter type", t => {
	const diagnostics = getDiagnostics(
		[
			{
				fileName: "generic-accessor-element.ts",
				text: `
export class GenericElement<T> extends HTMLElement {
	items!: T[];

	get value(): never {
		throw new Error();
	}

set value(value: T) {}
}
customElements.define("generic-accessor-element", GenericElement);
`
			},
			{
				fileName: "generic-accessor-use.ts",
				entry: true,
				text: `
import "./generic-accessor-element";
declare const items: string[];
html\x60<generic-accessor-element .items="\${items}" .value="\${"value"}"></generic-accessor-element>\x60;
`
			}
		],
		{ rules: { "no-incompatible-property-type": false } }
	).diagnostics;
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Property binding: an inline generic class expression infers T from its items property", t => {
	const diagnostics = getDiagnostics(
		{
			fileName: "inline-generic-element.ts",
			entry: true,
			text: `
interface Item { id: string; }
declare const items: Item[];
declare const item: Item;
customElements.define("inline-generic-element", class GenericElement<T extends Item> extends HTMLElement {
	items!: T[];
	item!: T;
});
html\x60<inline-generic-element .items="\${items}" .item="\${item}"></inline-generic-element>\x60;
`
		},
		{ rules: { "no-incompatible-property-type": false } }
	).diagnostics;
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Property binding: TypeScript 6 iterator constructor types do not crash generic resolution", t => {
	const diagnostics = getDiagnostics(
		[
			{
				fileName: "iterator-element.ts",
				text: `
class GenericElement<T> extends HTMLElement {
	items!: T[];
	value!: IteratorConstructor;
}
customElements.define("generic-element", GenericElement);
`
			},
			{
				fileName: "iterator-use.ts",
				entry: true,
				text: `
declare const items: string[];
declare const value: any;
html\x60<generic-element .items="\${items}" .value="\${value}"></generic-element>\x60;
`
			}
		],
		{ rules: { "no-incompatible-property-type": false } }
	).diagnostics;
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Property binding: unrelated global types do not enter generic resolution", t => {
	const diagnostics = getDiagnostics(
		[
			{
				fileName: "global-type-element.ts",
				text: `
class GenericElement<T> extends HTMLElement {
	items!: T[];
	global!: typeof globalThis;
}
customElements.define("generic-element", GenericElement);
`
			},
			{
				fileName: "global-type-use.ts",
				entry: true,
				text: `
declare const globalValue: number;
declare const items: string[];
html\x60<generic-element .items="\${items}" .global="\${globalValue}"></generic-element>\x60;
`
			}
		],
		{ rules: { "no-incompatible-property-type": false } }
	).diagnostics;
	hasDiagnostic(t, diagnostics, "no-incompatible-type-binding");
});

tsTest("Property binding: unsupported library signatures in unrelated generic union branches do not crash", t => {
	const diagnostics = getDiagnostics(
		[
			{
				fileName: "generic-union-element.ts",
				text: `
class GenericElement<T> extends HTMLElement {
	value!: T[] | { callback: () => IteratorConstructor };
}
customElements.define("generic-union-element", GenericElement);
`
			},
			{
				fileName: "generic-union-use.ts",
				entry: true,
				text: `
declare const value: string[];
html\x60<generic-union-element .value="\${value}"></generic-union-element>\x60;
`
			}
		],
		{ rules: { "no-incompatible-property-type": false } }
	).diagnostics;
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Property binding: unsupported library signatures still report incompatible values", t => {
	const diagnostics = getDiagnostics(
		[
			{
				fileName: "generic-union-element-invalid.ts",
				text: `
class GenericElement<T> extends HTMLElement {
	value!: T[] | { callback: () => IteratorConstructor };
}
customElements.define("generic-union-element-invalid", GenericElement);
`
			},
			{
				fileName: "generic-union-use-invalid.ts",
				entry: true,
				text: `
declare const value: number;
html\x60<generic-union-element-invalid .value="\${value}"></generic-union-element-invalid>\x60;
`
			}
		],
		{ rules: { "no-incompatible-property-type": false } }
	).diagnostics;
	hasDiagnostic(t, diagnostics, "no-incompatible-type-binding");
});

tsTest("Property binding: generic constraints reject an inferred value outside the constraint", t => {
	const diagnostics = getDiagnostics(
		[
			{
				fileName: "generic-constraint-element.ts",
				text: `
interface Item { id: string; }
class GenericElement<T extends Item> extends HTMLElement {
	items!: T[];
}
customElements.define("generic-element", GenericElement);
`
			},
			{
				fileName: "generic-constraint-use.ts",
				entry: true,
				text: `
import "./generic-constraint-element";
declare const items: number[];
html\x60<generic-element .items="\${items}"></generic-element>\x60;
`
			}
		],
		{ rules: { "no-incompatible-property-type": false } }
	).diagnostics;
	hasDiagnostic(t, diagnostics, "no-incompatible-type-binding");
});

tsTest("Property binding: generic substitution preserves nominal member identity", t => {
	const diagnostics = getDiagnostics(
		[
			{
				fileName: "generic-nominal-element.ts",
				text: `
interface FirstItem { id: string; firstBrand: true; }
interface SecondItem { id: string; secondBrand: true; }
class GenericElement<T> extends HTMLElement {
	items!: T[];
	item!: T;
}
customElements.define("generic-element", GenericElement);
`
			},
			{
				fileName: "generic-nominal-use.ts",
				entry: true,
				text: `
import "./generic-nominal-element";
declare const items: FirstItem[];
declare const item: SecondItem;
html\x60<generic-element .items="\${items}" .item="\${item}"></generic-element>\x60;
`
			}
		],
		{ rules: { "no-incompatible-property-type": false } }
	).diagnostics;
	hasDiagnostic(t, diagnostics, "no-incompatible-type-binding");
});

tsTest("Property binding: generic callbacks still reject a narrower item type", t => {
	const diagnostics = getDiagnostics(
		[
			{
				fileName: "generic-types.ts",
				text: `
					export interface Item { id: string; }
					export interface NarrowItem extends Item { required: number; }
				`
			},
			{
				fileName: "generic-element.ts",
				text: `
					import type { Item } from "./generic-types";
					export class GenericElement<T extends Item> extends HTMLElement {
						items!: T[];
						templateProvider!: (item: T) => HTMLElement;
					}
					customElements.define("generic-element", GenericElement);
				`
			},
			{
				fileName: "generic-use.ts",
				entry: true,
				text: `
					import "./generic-element";
					import type { Item, NarrowItem } from "./generic-types";
					declare const items: Item[];
					declare const templateProvider: (item: NarrowItem) => HTMLElement;
					html\x60<generic-element .items="\${items}" .templateProvider="\${templateProvider}"></generic-element>\x60;
				`
			}
		],
		{ rules: { "no-incompatible-property-type": false } }
	).diagnostics;
	hasDiagnostic(t, diagnostics, "no-incompatible-type-binding");
});

tsTest("Property binding: generic callback parameters resolve all component parameters", t => {
	const diagnostics = getDiagnostics(
		[
			{
				fileName: "generic-callback-element.ts",
				text: `
interface Item { id: string; }
class GenericElement<T, U> extends HTMLElement {
	items!: T[];
	callback!: (item: T, extra: U) => void;
}
customElements.define("generic-element", GenericElement);
`
			},
			{
				fileName: "generic-callback-use.ts",
				entry: true,
				text: `
import "./generic-callback-element";
declare const items: Item[];
declare const callback: (item: Item, extra: string) => void;
html\x60<generic-element .items="\${items}" .callback="\${callback}"></generic-element>\x60;
`
			}
		],
		{ rules: { "no-incompatible-property-type": false } }
	).diagnostics;
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Property binding: nullable union members do not infer T from null", t => {
	const diagnostics = getDiagnostics(
		[
			{
				fileName: "generic-null-element.ts",
				text: `
interface Item { id: string; }
class GenericElement<T extends Item> extends HTMLElement {
	value!: T | null;
	callback!: (item: T) => void;
}
customElements.define("generic-element", GenericElement);
`
			},
			{
				fileName: "generic-null-use.ts",
				entry: true,
				text: `
import "./generic-null-element";
declare const value: null;
declare const callback: (item: Item) => void;
html\x60<generic-element .value="\${value}" .callback="\${callback}"></generic-element>\x60;
`
			}
		],
		{ rules: { "no-incompatible-property-type": false } }
	).diagnostics;
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Property binding: generic parameters in object members are substituted", t => {
	const diagnostics = getDiagnostics(
		[
			{
				fileName: "generic-object-element.ts",
				text: `
interface FirstItem { id: string; firstBrand: true; }
interface SecondItem { id: string; secondBrand: true; }
class GenericElement<T> extends HTMLElement {
	items!: T[];
	config!: { value: T };
}
customElements.define("generic-element", GenericElement);
`
			},
			{
				fileName: "generic-object-use.ts",
				entry: true,
				text: `
import "./generic-object-element";
declare const items: FirstItem[];
declare const config: { value: SecondItem };
html\x60<generic-element .items="\${items}" .config="\${config}"></generic-element>\x60;
`
			}
		],
		{ rules: { "no-incompatible-property-type": false } }
	).diagnostics;
	hasDiagnostic(t, diagnostics, "no-incompatible-type-binding");
});

tsTest("Property binding: repeated generic object shapes are checked independently", t => {
	const diagnostics = getDiagnostics(
		[
			{
				fileName: "generic-tuple-element.ts",
				text: `
class GenericElement<T> extends HTMLElement {
	pair!: [{ value: T }, { value: T }];
}
customElements.define("generic-element", GenericElement);
`
			},
			{
				fileName: "generic-tuple-use.ts",
				entry: true,
				text: `
import "./generic-tuple-element";
declare const pair: [{ value: number }, { value: string }];
html\x60<generic-element .pair="\${pair}"></generic-element>\x60;
`
			}
		],
		{ rules: { "no-incompatible-property-type": false } }
	).diagnostics;
	hasDiagnostic(t, diagnostics, "no-incompatible-type-binding");
});

tsTest("Property binding: readonly structural values remain assignable", t => {
	const diagnostics = getDiagnostics(
		[
			{
				fileName: "attribute-types.ts",
				text: `
					export interface AttributeTileAttribute { id: string; printName: string; }
					export interface OtherAttribute { id: string; }
				`
			},
			{
				fileName: "attribute-element.ts",
				text: `
					import type { AttributeTileAttribute } from "./attribute-types";
					export class AttributeElement extends HTMLElement {
						tile!: AttributeTileAttribute;
						tiles!: Readonly<AttributeTileAttribute>[];
					}
					customElements.define("attribute-element", AttributeElement);
				`
			},
			{
				fileName: "attribute-use.ts",
				entry: true,
				text: `
					import "./attribute-element";
					import type { AttributeTileAttribute, OtherAttribute } from "./attribute-types";
					declare const readonlyTile: Readonly<AttributeTileAttribute>;
					declare const tiles: AttributeTileAttribute[];
					declare const otherTile: OtherAttribute;
					html\x60<attribute-element .tile="\${readonlyTile}" .tiles="\${tiles}"></attribute-element>\x60;
					html\x60<attribute-element .tile="\${otherTile}"></attribute-element>\x60;
				`
			}
		],
		{ rules: { "no-incompatible-property-type": false } }
	).diagnostics;
	hasDiagnostic(t, diagnostics, "no-incompatible-type-binding");
});

tsTest("Property binding: compatible DTO arrays and callback returns remain assignable", t => {
	const diagnostics = getDiagnostics(
		[
			{
				fileName: "dto-types.ts",
				text: `
					export interface Row { id: string; label: string; }
					export interface NarrowRow extends Row { required: number; }
				`
			},
			{
				fileName: "dto-element.ts",
				text: `
					import type { Row } from "./dto-types";
					export class DtoElement extends HTMLElement {
						rows!: Row[];
						renderRow!: (row: Row) => HTMLElement;
					}
					customElements.define("dto-element", DtoElement);
				`
			},
			{
				fileName: "dto-use.ts",
				entry: true,
				text: `
					import "./dto-element";
					import type { NarrowRow, Row } from "./dto-types";
					declare const rows: Row[];
					declare const renderRow: (row: Row) => HTMLDivElement;
					declare const narrowRenderRow: (row: NarrowRow) => HTMLElement;
					html\x60<dto-element .rows="\${rows}" .renderRow="\${renderRow}"></dto-element>\x60;
					html\x60<dto-element .rows="\${rows}" .renderRow="\${narrowRenderRow}"></dto-element>\x60;
				`
			}
		],
		{ rules: { "no-incompatible-property-type": false } }
	).diagnostics;
	hasDiagnostic(t, diagnostics, "no-incompatible-type-binding");
});

tsTest("Property binding: imported assertion functions preserve narrowed getter types", t => {
	const diagnostics = getDiagnostics(
		[
			{
				fileName: "assertions.ts",
				text: `
					export function requireNonNullable<T>(value: T): asserts value is NonNullable<T> {
						if (value == null) throw new Error();
					}
				`
			},
			{
				fileName: "assertion-element.ts",
				text: `
					import { requireNonNullable } from "./assertions";
					export class AssertionElement extends HTMLElement {
						#value?: string;
						get value() {
							const value = this.#value;
							requireNonNullable(value);
							return value;
						}
						set value(value: string) {
							this.#value = value;
						}
					}
					customElements.define("assertion-element", AssertionElement);
				`
			},
			{
				fileName: "assertion-use.ts",
				entry: true,
				text: `
					import "./assertion-element";
					declare const value: string;
					declare const invalidValue: number;
					html\x60<assertion-element .value="\${value}"></assertion-element>\x60;
					html\x60<assertion-element .value="\${invalidValue}"></assertion-element>\x60;
				`
			}
		],
		{ rules: { "no-incompatible-property-type": false } }
	).diagnostics;
	hasDiagnostic(t, diagnostics, "no-incompatible-type-binding");
});

tsTest("Property binding: JavaScript uses relaxed assignability for optional values", t => {
	const diagnostics = getDiagnostics(
		[
			{
				fileName: "javascript-element.ts",
				text: `
export class MyElement extends HTMLElement {
	value!: string;
}
customElements.define("my-element", MyElement);
`
			},
			{
				fileName: "javascript-use.js",
				entry: true,
				text: `
import "./javascript-element";
/** @type {string | undefined} */
let value;
html\`<my-element .value="\${value}"></my-element>\`;
`
			}
		],
		{ rules: { "no-incompatible-property-type": false } }
	).diagnostics;
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Property binding: generic cards containing DOM nodes finish and retain inference", t => {
	const { diagnostics } = getDiagnostics(
		`
interface CardDefinition<T extends string> {
	heading: string | Node;
	description?: string | Node;
	value: T;
}
class CardSelector<T extends string> extends HTMLElement {
	cards!: CardDefinition<T>[];
}
customElements.define("x-card-selector", CardSelector);
declare const cards: CardDefinition<"fast" | "custom">[];
html\x60<x-card-selector .cards=\${cards}></x-card-selector>\x60;
`,
		{ rules: { "no-incompatible-property-type": false } }
	);
	hasNoDiagnostics(t, diagnostics);
});

for (const invalid of [false, true]) {
	tsTest(`Property binding: generic shared object branches ${invalid ? "reject incompatible values" : "finish with compatible values"}`, t => {
		const levels = Array.from(
			{ length: 8 },
			(_, i) => `level${i + 1}!: { left: GenericElement<T>["level${i}"]; right: GenericElement<T>["level${i}"] };`
		).join("\n");
		const { diagnostics } = getDiagnostics(
			`
class GenericElement<T> extends HTMLElement {
	items!: T[];
	level0!: { value: T; next?: GenericElement<T>["level0"] };
	${levels}
}
customElements.define("generic-element", GenericElement);
declare const items: string[];
declare const value: GenericElement<${invalid ? "number" : "string"}>["level8"];
html\x60<generic-element .items=\${items} .level8=\${value}></generic-element>\x60;
`,
			{ rules: { "no-incompatible-property-type": false } }
		);
		if (invalid) hasDiagnostic(t, diagnostics, "no-incompatible-type-binding");
		else hasNoDiagnostics(t, diagnostics);
	});
}

tsTest("Property binding: generic method parameters shadow component names", t => {
	const { diagnostics } = getDiagnostics(
		`
class GenericElement<T, U> extends HTMLElement {
	items!: T[];
	values!: U[];
	config!: { method: <T>(local: T) => void; value: U };
}
customElements.define("generic-element", GenericElement);
declare const items: string[];
declare const values: number[];
declare const config: { method: <T>(local: T) => void; value: number };
html\x60<generic-element .items=\${items} .values=\${values} .config=\${config}></generic-element>\x60;
`,
		{ rules: { "no-incompatible-property-type": false } }
	);
	hasNoDiagnostics(t, diagnostics);
});

for (const invalid of [false, true]) {
	tsTest(`Property binding: generic inline DOM objects ${invalid ? "reject incompatible values" : "retain inference"}`, t => {
		const { diagnostics } = getDiagnostics(
			`
class GenericElement<T> extends HTMLElement {
	items!: T[];
	config!: { heading: string | Node; value: T };
}
customElements.define("generic-element", GenericElement);
declare const items: string[];
declare const config: { heading: string | Node; value: ${invalid ? "number" : "string"} };
html\x60<generic-element .items=\${items} .config=\${config}></generic-element>\x60;
`,
			{ rules: { "no-incompatible-property-type": false } }
		);
		if (invalid) hasDiagnostic(t, diagnostics, "no-incompatible-type-binding");
		else hasNoDiagnostics(t, diagnostics);
	});
}

tsTest("Property binding: nullable generic preserves every source union member", t => {
	const diagnostics = getDiagnostics(
		`
 class UnionElement<T extends string> extends HTMLElement {
 value!: T | undefined;
 }
 customElements.define("union-element", UnionElement);
 declare const value: "fast" | "stepByStep";
 html\`<union-element .value="\${value}"></union-element>\`;
 `,
		{ rules: { "no-incompatible-property-type": false } }
	).diagnostics;
	hasNoDiagnostics(t, diagnostics);
});
