import { isAssignableToPrimitiveType as isSimpleTypeAssignableToPrimitiveType, toSimpleType } from "ts-simple-type";
import type { SimpleType } from "ts-simple-type";
import type { Type, TypeChecker, TypeReference } from "typescript";

/**
 * Tests whether a simple type can be bound as a primitive attribute value.
 *
 * Branded primitive types are represented as an intersection between their
 * primitive base and an object containing the brand. The object is only a
 * compile-time marker, so the primitive constituent determines how the value
 * is coerced at runtime.
 */
export function isAssignableToPrimitiveType(type: SimpleType, originalType?: Type, checker?: TypeChecker): boolean {
	if (originalType != null && checker != null && containsIntersectionType(type) && containsTypeParameter(originalType, checker)) {
		const apparentType = checker.getApparentType(originalType);
		if (apparentType !== originalType) {
			return isAssignableToPrimitiveType(toSimpleType(apparentType, checker));
		}
	}

	if (isSimpleTypeAssignableToPrimitiveType(type)) {
		return true;
	}

	switch (type.kind) {
		case "INTERSECTION":
			return type.types.some(childType => isAssignableToPrimitiveType(childType));

		case "UNION":
			return type.types.every(childType => isAssignableToPrimitiveType(childType));

		case "ALIAS":
		case "GENERIC_ARGUMENTS":
			return isAssignableToPrimitiveType(type.target);

		default:
			return false;
	}
}

function containsIntersectionType(type: SimpleType): boolean {
	switch (type.kind) {
		case "INTERSECTION":
			return true;

		case "UNION":
			return type.types.some(containsIntersectionType);

		case "ALIAS":
		case "GENERIC_ARGUMENTS":
			return containsIntersectionType(type.target);

		default:
			return false;
	}
}

function containsTypeParameter(type: Type, checker: TypeChecker, visited = new Set<Type>()): boolean {
	if (visited.has(type)) return false;
	visited.add(type);

	if ((type as { isTypeParameter(): boolean }).isTypeParameter()) return true;

	if (type.aliasTypeArguments?.some(typeArgument => containsTypeParameter(typeArgument, checker, visited))) {
		return true;
	}

	const typeArguments = (type as TypeReference).typeArguments || checker.getTypeArguments(type as TypeReference);
	if (typeArguments?.some(typeArgument => containsTypeParameter(typeArgument, checker, visited))) {
		return true;
	}

	return ((type as Type & { types?: readonly Type[] }).types || []).some(childType => containsTypeParameter(childType, checker, visited));
}
