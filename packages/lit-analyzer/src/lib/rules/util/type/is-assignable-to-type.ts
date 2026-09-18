import type { SimpleType, SimpleTypeComparisonOptions } from "ts-simple-type";
import { isAssignableToType as _isAssignableToType } from "ts-simple-type";
import type { Type } from "typescript";
import type { RuleModuleContext } from "../../../analyze/types/rule/rule-module-context.js";
import { getSimpleTypeOriginal } from "./simple-type-original.js";

export interface AssignabilityTypes {
	typeA: SimpleType;
	typeB: SimpleType;
	typeAOriginal?: Type;
	typeBOriginal?: Type;
}

export function isAssignableToType(
	{ typeA, typeB, typeAOriginal, typeBOriginal }: AssignabilityTypes,
	context: RuleModuleContext,
	options?: SimpleTypeComparisonOptions
): boolean {
	const inJsFile = context.file.fileName.endsWith(".js");
	const checker = context.program.getTypeChecker();
	const effectiveTypeAOriginal = typeAOriginal ?? getSimpleTypeOriginal(typeA, checker);
	const effectiveTypeBOriginal = typeBOriginal ?? getSimpleTypeOriginal(typeB, checker);
	if (!inJsFile && effectiveTypeAOriginal != null && effectiveTypeBOriginal != null) {
		if (checker.isTypeAssignableTo != null) {
			const isOriginalAssignable = checker.isTypeAssignableTo(effectiveTypeBOriginal, effectiveTypeAOriginal);
			// A custom comparator extends TypeScript assignability. If TypeScript rejects
			// the binding, let that comparator try its coercion or special-case rules.
			if (isOriginalAssignable || options?.isAssignable == null) {
				return isOriginalAssignable;
			}
		}
	}

	const expandedOptions = {
		...(inJsFile ? { strict: false } : {}),
		options: context.ts,
		...(options || {})
	};
	if (!inJsFile && options?.isAssignable == null) {
		expandedOptions.isAssignable = (nestedTypeA: SimpleType, nestedTypeB: SimpleType) => {
			const nestedTypeAOriginal = getSimpleTypeOriginal(nestedTypeA, checker);
			const nestedTypeBOriginal = getSimpleTypeOriginal(nestedTypeB, checker);
			if (nestedTypeAOriginal != null && nestedTypeBOriginal != null && checker.isTypeAssignableTo != null) {
				return checker.isTypeAssignableTo(nestedTypeBOriginal, nestedTypeAOriginal);
			}
			return undefined;
		};
	}
	return _isAssignableToType(typeA, typeB, context.program, expandedOptions);
}
