import type { SimpleType } from "ts-simple-type";
import { typeToString } from "ts-simple-type";
import type { TypeChecker } from "typescript";
import type { AnalyzerResult } from "../../../src/analyze/types/analyzer-result";
import { analyzeTextWithCurrentTsModule } from "../../helpers/analyze-text-with-current-ts-module";
import { tsTest } from "../../helpers/ts-test";

function assertSelectedType(t: { is(actual: unknown, expected: unknown, message?: string): void }, result: AnalyzerResult, checker: TypeChecker) {
	const { members = [] } = result.componentDefinitions[0]?.declaration || {};
	const selected = members.find(member => member.kind === "property" && member.propName === "selected");

	t.is(selected?.kind, "property");
	t.is(selected?.propName, "selected");
	t.is(selected?.modifiers?.has("readonly") ?? false, false);
	t.is(typeToString(selected?.type?.() as SimpleType, checker), "string | HTMLElement");
}

tsTest("Getter-first accessor pairs preserve the setter parameter type", t => {
	const {
		results: [result],
		checker
	} = analyzeTextWithCurrentTsModule({
		includeLib: true,
		fileName: "test.ts",
		text: `
		/** @element */
		class Tabs extends HTMLElement {
			get selected(): HTMLElement {
				return this;
			}

			set selected(value: HTMLElement | string) {}
		}
		`
	});

	assertSelectedType(t, result, checker);
});

tsTest("Setter-first accessor pairs preserve the setter parameter type", t => {
	const {
		results: [result],
		checker
	} = analyzeTextWithCurrentTsModule({
		includeLib: true,
		fileName: "test.ts",
		text: `
		/** @element */
		class Tabs extends HTMLElement {
			set selected(value: HTMLElement | string) {}

			get selected(): HTMLElement {
				return this;
			}
		}
		`
	});

	assertSelectedType(t, result, checker);
});