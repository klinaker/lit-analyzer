import { getDiagnostics } from "../helpers/analyze.js";
import { hasDiagnostic, hasNoDiagnostics } from "../helpers/assert.js";
import { tsTest } from "../helpers/ts-test.js";

tsTest("Don't report unknown attributes when 'no-unknown-attribute' is turned off", t => {
	const { diagnostics } = getDiagnostics("html`<input foo='' />`", { rules: { "no-unknown-attribute": false } });
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Report unknown attributes on known element", t => {
	const { diagnostics } = getDiagnostics("html`<input foo='' />`", { rules: { "no-unknown-attribute": true } });
	hasDiagnostic(t, diagnostics, "no-unknown-attribute");
});

tsTest("Don't report unknown attributes", t => {
	const { diagnostics } = getDiagnostics("html`<input required />`", { rules: { "no-unknown-attribute": true } });
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Don't report unknown attributes on unknown element", t => {
	const { diagnostics } = getDiagnostics("html`<unknown-element foo=''></unknown-element>`", {
		rules: { "no-unknown-attribute": true, "no-unknown-tag-name": false }
	});
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Don't report unknown data- attributes", t => {
	const { diagnostics } = getDiagnostics("html`<input data-foo='' />`", { rules: { "no-unknown-attribute": true } });
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Don't report element expressions", t => {
	const { diagnostics } = getDiagnostics("html`<input ${x} />`", { rules: { "no-unknown-attribute": true } });
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Don't report attributes from a static observedAttributes property", t => {
	const { diagnostics } = getDiagnostics(
		`
		class MyElement extends HTMLElement {
			static readonly observedAttributes = ["is-loading"] as const;
		}
		customElements.define("my-element", MyElement);
		html\`<my-element is-loading></my-element>\`;
	`,
		{ rules: { "no-unknown-attribute": true } }
	);

	hasNoDiagnostics(t, diagnostics);
});

tsTest("Don't report transitive inherited properties", t => {
	const { diagnostics } = getDiagnostics(
		`
		class BaseElement extends HTMLElement {
			disabled = false;
		}
		class IntermediateElement extends BaseElement {
			mapItemId = "";
		}
		class ScalePicker extends IntermediateElement {
			name = "";
		}
		customElements.define("scale-picker", ScalePicker);
		html\`<scale-picker .name="\${"scale"}" .disabled="\${true}" .mapItemId="\${"map"}"></scale-picker>\`;
	`,
		{ rules: { "no-unknown-attribute": true, "no-unknown-property": true } }
	);

	hasNoDiagnostics(t, diagnostics);
});

tsTest("Don't infer public attributes from getAttribute implementation details", t => {
	const { diagnostics } = getDiagnostics(
		`
		class MyElement extends HTMLElement {
			get internalValue() {
				return this.getAttribute("internal-value");
			}
		}
		customElements.define("my-element", MyElement);
		html\`<my-element internal-value="value"></my-element>\`;
	`,
		{ rules: { "no-unknown-attribute": true } }
	);

	hasDiagnostic(t, diagnostics, "no-unknown-attribute");
});
