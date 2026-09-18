import { resolve } from "path";
import type { DocumentRegistry } from "typescript";
import { DefaultLitAnalyzerContext } from "../../lib/analyze/default-lit-analyzer-context.js";
import { LitAnalyzer } from "../../lib/analyze/lit-analyzer.js";
import { makeConfig } from "../../lib/analyze/lit-analyzer-config.js";
import { HtmlDocument } from "../../lib/analyze/parse/document/text-document/html-document/html-document.js";
import { getSimpleTypeOriginal, rememberSimpleTypeOriginal } from "../../lib/rules/util/type/simple-type-original.js";
import { getCurrentTsModule, tsTest } from "../helpers/ts-test.js";

const directory = resolve("incremental-fixture");
const validConsumer = `
import "./element";
import type { Value } from "./types";
declare const value: Value;
html\`<x-value .value=\${value}></x-value>\`;
`;
const files = {
	"types.ts": `
export type Opaque<K, T> = T & { readonly __opaque__: K };
export type Id = Opaque<"Id", string>;
export interface Value { id: Id; node: Node | null; children: Value[]; }
`,
	"element.ts": `
import type { Value } from "./types";
export class ValueElement extends HTMLElement { value!: Value; }
customElements.define("x-value", ValueElement);
`,
	"consumer.ts": validConsumer
};

function createFixture(input = files, registry?: DocumentRegistry) {
	const ts = getCurrentTsModule();
	let projectVersion = 0;
	const scripts = new Map(
		Object.entries(input).map(([name, text]) => [resolve(directory, name), { snapshot: ts.ScriptSnapshot.fromString(text), version: text }])
	);
	const host = {
		...ts.sys,
		getScriptFileNames: () => [...scripts.keys()],
		getScriptVersion: (name: string) => scripts.get(name)?.version ?? "0",
		getProjectVersion: () => String(projectVersion),
		getScriptSnapshot: (name: string) => {
			const snapshot = scripts.get(name)?.snapshot;
			if (snapshot != null) return snapshot;
			const text = ts.sys.readFile(name);
			return text == null ? undefined : ts.ScriptSnapshot.fromString(text);
		},
		getCompilationSettings: () => ({
			target: ts.ScriptTarget.ESNext,
			module: ts.ModuleKind.ESNext,
			moduleResolution: ts.ModuleResolutionKind.Bundler,
			strict: true,
			lib: ["lib.dom.d.ts", "lib.esnext.d.ts"]
		}),
		getCurrentDirectory: () => directory,
		useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
		getDefaultLibFileName: ts.getDefaultLibFilePath,
		fileExists: (name: string) => scripts.has(name) || ts.sys.fileExists(name),
		directoryExists: (name: string) => name === directory || ts.sys.directoryExists(name),
		readFile: (name: string) => {
			const snapshot = scripts.get(name)?.snapshot;
			return snapshot?.getText(0, snapshot.getLength()) ?? ts.sys.readFile(name);
		}
	};
	const service = ts.createLanguageService(host, registry);
	const context = new DefaultLitAnalyzerContext({ ts, getProgram: () => service.getProgram()! });
	context.updateConfig(makeConfig({ strict: true, rules: { "no-incompatible-property-type": "off" } }));
	const analyzer = new LitAnalyzer(context);
	return {
		context,
		dispose: () => service.dispose(),
		sourceFile: (name: string) => context.program.getSourceFile(resolve(directory, name))!,
		diagnostics: () => analyzer.getDiagnosticsInFile(context.program.getSourceFile(resolve(directory, "consumer.ts"))!).map(d => d.source),
		member: () => context.htmlStore.getHtmlTag("x-value")!.properties.find(member => member.name === "value")!,
		edit(name: string, text: string) {
			projectVersion++;
			scripts.set(resolve(directory, name), { snapshot: ts.ScriptSnapshot.fromString(text), version: `${projectVersion}:${text}` });
		}
	};
}

tsTest("Incremental native types follow the checker while component declarations are reused", t => {
	const fixture = createFixture();
	t.teardown(fixture.dispose);
	t.deepEqual(fixture.diagnostics(), []);
	const declarationFile = fixture.sourceFile("element.ts");
	const originalChecker = fixture.context.program.getTypeChecker();
	const member = fixture.member();
	const originalType = member.getType(originalChecker);
	t.is(member.getTypeScriptType?.(originalChecker), originalChecker.getTypeAtLocation(member.declaration!.node));

	fixture.edit("consumer.ts", `${validConsumer}\n// harmless edit`);
	t.deepEqual(fixture.diagnostics(), []);
	const checker = fixture.context.program.getTypeChecker();
	t.not(checker, originalChecker);
	t.is(fixture.sourceFile("element.ts"), declarationFile);
	t.is(fixture.member(), member);
	t.is(member.getTypeScriptType?.(checker), checker.getTypeAtLocation(member.declaration!.node));
	t.not(member.getType(checker), originalType);
	t.is(member.getType(checker), member.getType(checker));
});

tsTest("Incremental binding errors clear after repeated fixes", t => {
	const fixture = createFixture();
	t.teardown(fixture.dispose);
	t.deepEqual(fixture.diagnostics(), []);
	for (let edit = 0; edit < 3; edit++) {
		fixture.edit("consumer.ts", validConsumer.replace("${value}", "${42}"));
		t.deepEqual(fixture.diagnostics(), ["no-incompatible-type-binding"]);
		fixture.edit("consumer.ts", validConsumer);
		t.deepEqual(fixture.diagnostics(), []);
	}
});

tsTest("Dependency-only edits refresh binding targets in unchanged templates", t => {
	const fixture = createFixture({
		...files,
		"types.ts": "export type Value = string;",
		"consumer.ts": validConsumer.replace("declare const value: Value;", 'const value = "text";')
	});
	t.teardown(fixture.dispose);
	t.deepEqual(fixture.diagnostics(), []);
	const consumerFile = fixture.sourceFile("consumer.ts");
	const declarationFile = fixture.sourceFile("element.ts");
	const { context } = fixture;
	const document = context.documentStore.getDocumentsInFile(consumerFile, context.config).find(document => document instanceof HtmlDocument)!;
	const reusedDocumentDiagnostics = () => context.rules.getDiagnosticsFromDocument(document, context).map(d => d.source);
	t.deepEqual(reusedDocumentDiagnostics(), []);
	fixture.edit("types.ts", "export type Value = number;");
	t.deepEqual(fixture.diagnostics(), ["no-incompatible-type-binding"]);
	t.deepEqual(reusedDocumentDiagnostics(), ["no-incompatible-type-binding"]);
	t.is(fixture.sourceFile("consumer.ts"), consumerFile);
	t.is(fixture.sourceFile("element.ts"), declarationFile);
	fixture.edit("types.ts", "export type Value = string;");
	t.deepEqual(fixture.diagnostics(), []);
	t.deepEqual(reusedDocumentDiagnostics(), []);
});

tsTest("Generic opaque bindings remain current across edits", t => {
	const consumer = `
import "./element";
import type { Value, Id } from "./types";
declare const values: Value[];
declare const value: Value;
declare const wrong: Id;
html\`<x-values .items=\${values} .selected=\${value}></x-values>\`;
`;
	const fixture = createFixture({
		...files,
		"element.ts": `
export class ValuesElement<T> extends HTMLElement { items!: T[]; selected?: T; }
customElements.define("x-values", ValuesElement);
`,
		"consumer.ts": consumer
	});
	t.teardown(fixture.dispose);
	t.deepEqual(fixture.diagnostics(), []);
	for (let edit = 0; edit < 2; edit++) {
		fixture.edit("consumer.ts", consumer.replace("${value}", "${wrong}"));
		t.deepEqual(fixture.diagnostics(), ["no-incompatible-type-binding"]);
		fixture.edit("consumer.ts", consumer);
		t.deepEqual(fixture.diagnostics(), []);
	}
});

tsTest("Incremental bindings preserve setter write types and merged native declarations", t => {
	const consumer = 'import "./element"; html`<x-value .value=${"text"}></x-value><input .part=${"part-name"}>`;';
	const fixture = createFixture({
		...files,
		"element.ts": `
export class ValueElement extends HTMLElement {
 get value(): HTMLElement { return this; }
 set value(value: HTMLElement | string) {}
}
customElements.define("x-value", ValueElement);
`,
		"consumer.ts": consumer
	});
	t.teardown(fixture.dispose);
	t.deepEqual(fixture.diagnostics(), []);
	fixture.edit("consumer.ts", consumer.replace('${"text"}', "${42}"));
	t.deepEqual(fixture.diagnostics(), ["no-incompatible-type-binding"]);
	fixture.edit("consumer.ts", consumer);
	t.deepEqual(fixture.diagnostics(), []);
});

tsTest("Interleaved analyzers can share declarations without sharing checker-owned types", t => {
	const registry = getCurrentTsModule().createDocumentRegistry(true, directory);
	const first = createFixture(files, registry);
	const second = createFixture(files, registry);
	t.teardown(first.dispose);
	t.teardown(second.dispose);
	t.deepEqual(first.diagnostics(), []);
	t.deepEqual(second.diagnostics(), []);
	t.is(first.sourceFile("element.ts"), second.sourceFile("element.ts"));
	t.not(first.context.program.getTypeChecker(), second.context.program.getTypeChecker());
	const firstChecker = first.context.program.getTypeChecker();
	const secondChecker = second.context.program.getTypeChecker();
	const simpleType = first.member().getType(firstChecker);
	const firstNative = first.member().getTypeScriptType!(firstChecker)!;
	const secondNative = second.member().getTypeScriptType!(secondChecker)!;
	rememberSimpleTypeOriginal(simpleType, firstNative, firstChecker);
	t.is(getSimpleTypeOriginal(simpleType, secondChecker), undefined);
	rememberSimpleTypeOriginal(simpleType, secondNative, secondChecker);
	t.is(getSimpleTypeOriginal(simpleType, firstChecker), firstNative);
	t.is(getSimpleTypeOriginal(simpleType, secondChecker), secondNative);
	for (const fixture of [first, second, first, second]) {
		fixture.edit("consumer.ts", `${validConsumer}\n// edit`);
		t.deepEqual(fixture.diagnostics(), []);
		const member = fixture.member();
		const checker = fixture.context.program.getTypeChecker();
		t.is(member.getTypeScriptType?.(checker), checker.getTypeAtLocation(member.declaration!.node));
	}
});
