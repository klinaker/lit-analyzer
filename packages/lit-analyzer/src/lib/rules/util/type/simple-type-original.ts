import type { SimpleType } from "ts-simple-type";
import { typeToString } from "ts-simple-type";
import type { Signature, Type, TypeChecker, TypeReference } from "typescript";

const originalTypes = new WeakMap<TypeChecker, WeakMap<SimpleType, Type>>();

/**
 * Keeps the TypeScript type that a SimpleType was derived from available for
 * nested assignability checks. When a generic shape is supplied, only paths
 * that can contain a generic parameter are expanded; this avoids walking the
 * entire DOM type graph for an unrelated callback return type.
 */
export function rememberSimpleTypeOriginal(type: SimpleType, original: Type, checker: TypeChecker, genericShape?: SimpleType): void {
	rememberSimpleTypeOriginalInternal(type, original, checker, genericShape, new Set<SimpleType>());
}

export function getSimpleTypeOriginal(type: SimpleType, checker: TypeChecker): Type | undefined {
	return originalTypes.get(checker)?.get(type);
}

/**
 * Formats a SimpleType without allowing an unsupported lazy branch to abort
 * analysis. The checker type is a useful fallback for types that were
 * successfully associated with their TypeScript original.
 */
export function simpleTypeToStringSafe(type: SimpleType, checker: TypeChecker): string {
	try {
		return typeToString(type);
	} catch {
		const original = getSimpleTypeOriginal(type, checker);
		if (original != null) {
			try {
				return checker.typeToString(original);
			} catch {
				// Fall through to the stable placeholder below.
			}
		}
		return "unknown";
	}
}

function rememberSimpleTypeOriginalInternal(
	type: SimpleType,
	original: Type,
	checker: TypeChecker,
	shape: SimpleType | undefined,
	seen: Set<SimpleType>
): void {
	if (seen.has(type)) return;
	seen.add(type);
	let checkerTypes = originalTypes.get(checker);
	if (checkerTypes == null) {
		checkerTypes = new WeakMap<SimpleType, Type>();
		originalTypes.set(checker, checkerTypes);
	}
	checkerTypes.set(type, original);

	if (shape == null || !containsGenericParameter(shape)) return;

	switch (shape.kind) {
		case "GENERIC_PARAMETER":
			return;
		case "ARRAY": {
			if (type.kind !== "ARRAY") return;
			const originalElement = getTypeArguments(original, checker)[0];
			if (originalElement != null) rememberSimpleTypeOriginalInternal(type.type, originalElement, checker, shape.type, seen);
			return;
		}
		case "PROMISE": {
			if (type.kind !== "PROMISE") return;
			const originalElement = getTypeArguments(original, checker)[0];
			if (originalElement != null) rememberSimpleTypeOriginalInternal(type.type, originalElement, checker, shape.type, seen);
			return;
		}
		case "UNION":
		case "INTERSECTION": {
			if (type.kind !== shape.kind) return;
			const originalTypes = original.isUnion() || original.isIntersection() ? original.types : [];
			shape.types.forEach((shapeChild, index) => {
				const child = type.types[index];
				const originalChild = originalTypes[index];
				if (child != null && originalChild != null) rememberSimpleTypeOriginalInternal(child, originalChild, checker, shapeChild, seen);
			});
			return;
		}
		case "ALIAS": {
			const child = type.kind === "ALIAS" ? type.target : type;
			rememberSimpleTypeOriginalInternal(child, original, checker, shape.target, seen);
			return;
		}
		case "GENERIC_ARGUMENTS": {
			if (type.kind !== "GENERIC_ARGUMENTS") return;
			const originalArguments = getTypeArguments(original, checker);
			shape.typeArguments.forEach((shapeChild, index) => {
				const child = type.typeArguments[index];
				const originalChild = originalArguments[index];
				if (child != null && originalChild != null) rememberSimpleTypeOriginalInternal(child, originalChild, checker, shapeChild, seen);
			});
			return;
		}
		case "TUPLE": {
			if (type.kind !== "TUPLE") return;
			const originalArguments = getTypeArguments(original, checker);
			shape.members.forEach((shapeMember, index) => {
				const member = type.members[index];
				const originalMember = originalArguments[index];
				if (member != null && originalMember != null)
					rememberSimpleTypeOriginalInternal(member.type, originalMember, checker, shapeMember.type, seen);
			});
			return;
		}
		case "OBJECT":
		case "INTERFACE":
		case "CLASS": {
			if (type.kind !== "OBJECT" && type.kind !== "INTERFACE" && type.kind !== "CLASS") return;
			if (shape.call != null && containsGenericParameter(shape.call)) {
				const call = type.call;
				const signature = call == null ? undefined : checker.getSignaturesOfType(original, 0)[0];
				if (call != null && signature != null) rememberFunctionOriginal(call, signature, checker, shape.call, seen);
				return;
			}
			if (shape.ctor != null && containsGenericParameter(shape.ctor)) {
				const ctor = type.ctor;
				const signature = ctor == null ? undefined : checker.getSignaturesOfType(original, 1)[0];
				if (ctor != null && signature != null) rememberFunctionOriginal(ctor, signature, checker, shape.ctor, seen);
				return;
			}
			for (const shapeMember of shape.members || []) {
				if (!containsGenericParameter(shapeMember.type)) continue;
				const member = type.members?.find(candidate => candidate.name === shapeMember.name);
				const memberSymbol = checker.getPropertyOfType(original, shapeMember.name);
				const declaration = memberSymbol?.valueDeclaration ?? memberSymbol?.declarations?.[0];
				if (member != null && memberSymbol != null && declaration != null) {
					const memberType = checker.getTypeOfSymbolAtLocation(memberSymbol, declaration);
					rememberSimpleTypeOriginalInternal(member.type, memberType, checker, shapeMember.type, seen);
				}
			}
			return;
		}
		case "FUNCTION":
		case "METHOD": {
			if (type.kind !== "FUNCTION" && type.kind !== "METHOD") return;
			const signature = checker.getSignaturesOfType(original, 0)[0];
			if (signature != null) rememberFunctionOriginal(type, signature, checker, shape, seen);
			return;
		}
	}
}

function rememberFunctionOriginal(
	type: SimpleType & { parameters?: { type: SimpleType }[]; returnType?: SimpleType },
	signature: Signature,
	checker: TypeChecker,
	shape: SimpleType & { parameters?: { type: SimpleType }[]; returnType?: SimpleType },
	seen: Set<SimpleType>
): void {
	const declaration = signature.getDeclaration();
	if (declaration == null) return;
	if (shape.parameters != null && type.parameters != null) {
		shape.parameters.forEach((shapeParameter, index) => {
			if (!containsGenericParameter(shapeParameter.type)) return;
			const parameter = type.parameters?.[index];
			const originalParameter = signature.parameters[index];
			if (parameter != null && originalParameter != null) {
				const parameterType = checker.getTypeOfSymbolAtLocation(originalParameter, declaration);
				rememberSimpleTypeOriginalInternal(parameter.type, parameterType, checker, shapeParameter.type, seen);
			}
		});
	}
}

function containsGenericParameter(type: SimpleType, seen = new Set<SimpleType>()): boolean {
	if (seen.has(type)) return false;
	seen.add(type);

	let kind: SimpleType["kind"] | undefined;
	try {
		kind = type.kind;
	} catch {
		// TypeScript 6 can expose a lazy library signature that ts-simple-type
		// cannot resolve. It cannot contain a usable generic parameter.
		return false;
	}
	if (kind == null) return false;

	let result: boolean;
	switch (type.kind) {
		case "GENERIC_PARAMETER":
			result = true;
			break;
		case "ARRAY":
		case "PROMISE":
			result = containsGenericParameter(type.type, seen);
			break;
		case "UNION":
		case "INTERSECTION":
			result = type.types.some(child => containsGenericParameter(child, seen));
			break;
		case "ALIAS":
			result = containsGenericParameter(type.target, seen);
			break;
		case "GENERIC_ARGUMENTS":
			result = containsGenericParameter(type.target, seen) || type.typeArguments.some(child => containsGenericParameter(child, seen));
			break;
		case "TUPLE":
			result = type.members.some(member => containsGenericParameter(member.type, seen));
			break;
		case "OBJECT":
		case "INTERFACE":
		case "CLASS":
			result = type.call != null && containsGenericParameter(type.call, seen);
			if (!result) result = type.ctor != null && containsGenericParameter(type.ctor, seen);
			if (!result) result = type.members?.some(member => containsGenericParameter(member.type, seen)) === true;
			break;
		case "FUNCTION":
		case "METHOD":
			// Callback return types are not used for generic inference. Avoid
			// resolving them because DOM/library return types can contain unrelated
			// TypeScript signatures that ts-simple-type cannot represent.
			result = type.parameters?.some(parameter => containsGenericParameter(parameter.type, seen)) === true;
			break;
		default:
			result = false;
	}

	return result;
}

function getTypeArguments(type: Type, checker: TypeChecker): readonly Type[] {
	try {
		return checker.getTypeArguments(type as TypeReference) || [];
	} catch {
		return [];
	}
}
