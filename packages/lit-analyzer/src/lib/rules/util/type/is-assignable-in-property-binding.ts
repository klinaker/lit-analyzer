import type { HtmlNodeAttr } from "../../../analyze/types/html-node/html-node-attr-types.js";
import type { RuleModuleContext } from "../../../analyze/types/rule/rule-module-context.js";
import { rangeFromHtmlNodeAttr } from "../../../analyze/util/range-util.js";
import { isAssignableBindingUnderSecuritySystem } from "./is-assignable-binding-under-security-system.js";
import type { AssignabilityTypes } from "./is-assignable-to-type.js";
import { isAssignableToType } from "./is-assignable-to-type.js";
import { simpleTypeToStringSafe } from "./simple-type-original.js";

export function isAssignableInPropertyBinding(
	htmlAttr: HtmlNodeAttr,
	{ typeA, typeB, typeAOriginal, typeBOriginal }: AssignabilityTypes,
	context: RuleModuleContext
): boolean | undefined {
	const securitySystemResult = isAssignableBindingUnderSecuritySystem(htmlAttr, { typeA, typeB }, context);
	if (securitySystemResult !== undefined) {
		// The security diagnostics take precedence here,
		//   and we should not do any more checking.
		return securitySystemResult;
	}

	if (!isAssignableToType({ typeA, typeB, typeAOriginal, typeBOriginal }, context)) {
		context.report({
			location: rangeFromHtmlNodeAttr(htmlAttr),
			message: `Type '${simpleTypeToStringSafe(typeB, context.program.getTypeChecker())}' is not assignable to '${simpleTypeToStringSafe(
				typeA,
				context.program.getTypeChecker()
			)}'`
		});

		return false;
	}

	return true;
}
