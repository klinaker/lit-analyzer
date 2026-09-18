import type { SimpleType } from "ts-simple-type";
import { isSimpleType, toSimpleType } from "ts-simple-type";
import type { HtmlAttrTarget } from "../../../analyze/parse/parse-html-data/html-tag.js";
import { isHtmlMember } from "../../../analyze/parse/parse-html-data/html-tag.js";
import type { Expression, Node, Type, TypeChecker, TypeParameterDeclaration } from "typescript";
import type { HtmlNodeAttrAssignment } from "../../../analyze/types/html-node/html-node-attr-assignment-types.js";
import { HtmlNodeAttrAssignmentKind } from "../../../analyze/types/html-node/html-node-attr-assignment-types.js";
import { HtmlNodeAttrKind } from "../../../analyze/types/html-node/html-node-attr-types.js";
import type { RuleModuleContext } from "../../../analyze/types/rule/rule-module-context.js";
import { isAssignableToType } from "./is-assignable-to-type.js";
import { rememberSimpleTypeOriginal } from "./simple-type-original.js";

interface GenericComponentTypeResolution {
	type: SimpleType;
	wasResolved: boolean;
}

interface GenericParameterInfo {
	// Cached type identity distinguishes this parameter from library parameters with the same name.
	type: SimpleType;
	constraint?: SimpleType;
	defaultType?: SimpleType;
}

interface GenericCandidate {
	targetType: SimpleType;
	sourceType: SimpleType;
	priority: number;
}

/**
 * Resolve generic member types for a single custom-element use site.
 *
 * Custom elements are registered without a type argument, but a tag can still
 * provide one through a data-shaped property such as `items: T[]`. That
 * inferred argument is then used for the other members on the same tag.
 */
export function resolveGenericComponentType(
	assignment: HtmlNodeAttrAssignment,
	target: HtmlAttrTarget,
	context: RuleModuleContext
): GenericComponentTypeResolution | undefined {
	if (!isHtmlMember(target)) {
		return undefined;
	}

	const componentDeclaration = target.declaration?.declaration;
	if (componentDeclaration == null) {
		return undefined;
	}

	const genericParameterNames = getGenericParameterNames(componentDeclaration.node, context.ts);
	if (genericParameterNames.size === 0) {
		return undefined;
	}

	// Avoid converting unrelated library types just to discover that they do not
	// contain a parameter from this component. Types such as `typeof globalThis`
	// can expose a very large, lazy type graph to ts-simple-type.
	if (!mayContainGenericComponentParameter(target, genericParameterNames, context.ts)) {
		return undefined;
	}

	const checker = context.program.getTypeChecker();
	const targetType = target.getType(checker);
	if (!containsGenericParameter(targetType)) {
		return undefined;
	}

	const genericParameters = getGenericParameterInfo(componentDeclaration.node, context);
	const candidates = assignment.htmlAttr.htmlNode.attributes
		.filter(attr => attr.modifier === "." && attr.assignment != null)
		.map(attr => {
			const candidateTarget = context.htmlStore.getHtmlAttrTarget(attr);
			if (
				candidateTarget == null ||
				!isHtmlMember(candidateTarget) ||
				candidateTarget.declaration?.declaration !== componentDeclaration ||
				candidateTarget.declaration == null ||
				attr.assignment == null
			) {
				return undefined;
			}
			if (!mayContainGenericComponentParameter(candidateTarget, genericParameterNames, context.ts)) {
				return undefined;
			}

			const inferredType = inferSourceType(attr.assignment, checker);
			const sourceType = isSimpleType(inferredType) ? inferredType : toSimpleType(inferredType, checker);
			if (!isSimpleType(inferredType)) {
				rememberSimpleTypeOriginal(sourceType, inferredType, checker);
			}

			const targetType = candidateTarget.getType(checker);
			const targetOriginal = candidateTarget.getTypeScriptType?.(checker);
			if (targetOriginal != null) {
				rememberSimpleTypeOriginal(targetType, targetOriginal, checker, targetType);
				if (!isSimpleType(inferredType)) {
					rememberSimpleTypeOriginal(sourceType, inferredType, checker, targetType);
				}
			}

			return {
				targetType,
				sourceType,
				priority: genericInferencePriority(targetType)
			};
		})
		.filter((candidate): candidate is GenericCandidate => candidate != null)
		.sort((a, b) => a.priority - b.priority);

	const substitutions = new Map<string, SimpleType>();
	for (const candidate of candidates) {
		inferGenericParameters(candidate.targetType, candidate.sourceType, substitutions, context);
	}

	if (substitutions.size === 0) {
		return undefined;
	}

	applyGenericConstraints(substitutions, genericParameters, context);

	const resolvedType = substituteGenericParameters(targetType, substitutions, genericParameters);
	// Converted types can retain parameters from nested aliases. Only the
	// component's own parameters determine whether its instantiation is resolved.
	const wasResolved = !hasUnresolvedGenericParameter(resolvedType, new Set([...genericParameters.values()].map(parameter => parameter.type)));

	return {
		type: resolvedType,
		wasResolved
	};
}

function getGenericParameterNames(node: Node, ts: RuleModuleContext["ts"]): Set<string> {
	return new Set(getTypeParameters(node, ts).map(parameter => parameter.name.text));
}

function getTypeParameters(node: Node, ts: RuleModuleContext["ts"]): readonly TypeParameterDeclaration[] {
	if (ts.isClassLike(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isFunctionDeclaration(node)) {
		return node.typeParameters ?? [];
	}
	return [];
}

function getComponentMemberTypeNode(node: Node | undefined, ts: RuleModuleContext["ts"]): Node | undefined {
	if (node == null) return undefined;

	if (ts.isPropertyDeclaration(node) || ts.isPropertySignature(node) || ts.isGetAccessor(node)) {
		return node.type;
	}

	if (ts.isSetAccessor(node)) {
		return node.parameters[0]?.type;
	}

	return undefined;
}

function mayContainGenericComponentParameter(target: HtmlAttrTarget, names: Set<string>, ts: RuleModuleContext["ts"]): boolean {
	const memberTypeNode = getComponentMemberTypeNode(target.declaration?.node, ts);
	if (memberTypeNode == null) return true;

	let found = false;
	const visit = (current: Node): void => {
		if (found) return;

		if (ts.isTypeReferenceNode(current) && ts.isIdentifier(current.typeName) && names.has(current.typeName.text)) {
			found = true;
			return;
		}

		current.forEachChild(visit);
	};

	visit(memberTypeNode);
	return found;
}

function genericInferencePriority(type: SimpleType): number {
	// Arrays and tuples carry the item type directly. Function parameters are
	// deliberately lower priority so a callback cannot choose a different T
	// before the component's data property has established it.
	try {
		if (type.kind === "ARRAY" || type.kind === "TUPLE") {
			return 0;
		}

		if (type.kind === "FUNCTION" || type.kind === "METHOD") {
			return 2;
		}
	} catch {
		// Some TypeScript 6 library types cannot be fully converted by the
		// current ts-simple-type version. They cannot contribute a useful
		// inference priority, so keep their default priority.
	}

	return 1;
}

function getGenericParameterInfo(node: Node, context: RuleModuleContext): Map<string, GenericParameterInfo> {
	const { ts } = context;
	const typeParameters = getTypeParameters(node, ts);
	const result = new Map<string, GenericParameterInfo>();
	const checker = context.program.getTypeChecker();

	for (const parameter of typeParameters || []) {
		const parameterType = checker.getTypeAtLocation(parameter);
		const info: GenericParameterInfo = { type: toSimpleType(parameterType, checker) };
		const constraintOriginal =
			parameter.constraint == null ? checker.getBaseConstraintOfType(parameterType) : checker.getTypeFromTypeNode(parameter.constraint);
		if (constraintOriginal != null) {
			info.constraint = toSimpleType(constraintOriginal, checker);
			rememberSimpleTypeOriginal(info.constraint, constraintOriginal, checker);
		}
		const defaultOriginal = parameter.default == null ? undefined : checker.getTypeFromTypeNode(parameter.default);
		if (defaultOriginal != null) {
			info.defaultType = toSimpleType(defaultOriginal, checker);
			rememberSimpleTypeOriginal(info.defaultType, defaultOriginal, checker);
		}
		result.set(parameter.name.getText(), info);
	}

	return result;
}

function collectGenericParameterNames(
	type: SimpleType,
	seen = new Set<SimpleType>(),
	result = new Set<string>(),
	parameters?: ReadonlySet<SimpleType>
): Set<string> {
	if (parameters?.size === 0 || seen.has(type)) return result;
	seen.add(type);

	try {
		if (type.kind == null) return result;
	} catch {
		// Skip an unsupported lazy library branch without losing later component parameters.
		return result;
	}
	switch (type.kind) {
		case "GENERIC_PARAMETER":
			if (parameters == null || parameters.has(type)) result.add(type.name);
			break;
		case "ARRAY":
		case "PROMISE":
			collectGenericParameterNames(type.type, seen, result, parameters);
			break;
		case "UNION":
		case "INTERSECTION":
			for (const child of type.types) {
				const resultSizeBeforeChild: number = result.size;
				collectGenericParameterNames(child, seen, result, parameters);
				if (result.size !== resultSizeBeforeChild) break;
			}
			break;
		case "ALIAS":
			collectGenericParameterNames(type.target, seen, result, parameters);
			break;
		case "GENERIC_ARGUMENTS":
			// The target declares its own parameters; only the arguments belong
			// to this use site (for example CardDefinition<T> or NodeListOf<ChildNode>).
			for (const child of type.typeArguments) {
				const resultSizeBeforeChild = result.size;
				collectGenericParameterNames(child, seen, result, parameters);
				if (result.size !== resultSizeBeforeChild) break;
			}
			break;
		case "TUPLE":
			for (const member of type.members) {
				const resultSizeBeforeMember = result.size;
				collectGenericParameterNames(member.type, seen, result, parameters);
				if (result.size !== resultSizeBeforeMember) break;
			}
			break;
		case "OBJECT":
		case "INTERFACE":
		case "CLASS": {
			const resultSizeBeforeCall = result.size;
			if (type.call != null) collectGenericParameterNames(type.call, seen, result, parameters);
			if (result.size !== resultSizeBeforeCall) break;
			const resultSizeBeforeCtor = result.size;
			if (type.ctor != null) collectGenericParameterNames(type.ctor, seen, result, parameters);
			if (result.size !== resultSizeBeforeCtor) break;
			for (const member of type.members || []) {
				const resultSizeBeforeMember = result.size;
				collectGenericParameterNames(member.type, seen, result, parameters);
				if (result.size !== resultSizeBeforeMember) break;
			}
			if (type.indexType != null)
				Object.values(type.indexType).forEach(child => child != null && collectGenericParameterNames(child, seen, result, parameters));
			break;
		}
		case "FUNCTION":
		case "METHOD":
			for (const parameter of type.parameters || []) {
				collectGenericParameterNames(parameter.type, seen, result, parameters);
			}
			if (result.size === 0) {
				const returnType = getDirectGenericReturnType(type);
				if (returnType?.name != null && (parameters == null || parameters.has(returnType))) result.add(returnType.name);
			}
			break;
	}

	return result;
}

function containsGenericParameter(type: SimpleType): boolean {
	try {
		return collectGenericParameterNames(type).size > 0;
	} catch {
		return false;
	}
}

function hasUnresolvedGenericParameter(type: SimpleType, parameters: Set<SimpleType>): boolean {
	return collectGenericParameterNames(type, new Set(), new Set(), parameters).size > 0;
}

function inferGenericParameters(
	pattern: SimpleType,
	source: SimpleType,
	substitutions: Map<string, SimpleType>,
	context: RuleModuleContext,
	seen = new Map<SimpleType, Set<SimpleType>>()
): void {
	if (seen.size > 24) return;
	let genericParameterNames: Set<string>;
	try {
		genericParameterNames = collectGenericParameterNames(pattern);
	} catch {
		return;
	}
	if (genericParameterNames.size === 0 || [...genericParameterNames].every(name => substitutions.has(name))) return;
	const seenSources = seen.get(pattern);
	if (seenSources?.has(source)) return;
	if (seenSources == null) seen.set(pattern, new Set([source]));
	else seenSources.add(source);

	try {
		inferGenericParametersInternal(pattern, source, substitutions, context, seen);
	} finally {
		const currentSources = seen.get(pattern);
		currentSources?.delete(source);
		if (currentSources?.size === 0) seen.delete(pattern);
	}
}

function inferGenericParametersInternal(
	pattern: SimpleType,
	source: SimpleType,
	substitutions: Map<string, SimpleType>,
	context: RuleModuleContext,
	seen: Map<SimpleType, Set<SimpleType>>
): void {
	switch (pattern.kind) {
		case "GENERIC_PARAMETER": {
			const usableSource = removeNullableInference(source);
			if (!isUnusableInference(usableSource) && !substitutions.has(pattern.name)) {
				substitutions.set(pattern.name, usableSource);
			}
			return;
		}
		case "ARRAY":
			if (source.kind === "ARRAY") inferGenericParameters(pattern.type, source.type, substitutions, context, seen);
			return;
		case "TUPLE":
			if (source.kind === "TUPLE") {
				pattern.members.forEach((member, index) => {
					const sourceMember = source.members[index];
					if (sourceMember != null) inferGenericParameters(member.type, sourceMember.type, substitutions, context, seen);
				});
			}
			return;
		case "PROMISE":
			if (source.kind === "PROMISE") inferGenericParameters(pattern.type, source.type, substitutions, context, seen);
			return;
		case "ALIAS":
			inferGenericParameters(pattern.target, unwrapAlias(source), substitutions, context, seen);
			return;
		case "GENERIC_ARGUMENTS":
			if (source.kind === "GENERIC_ARGUMENTS") {
				pattern.typeArguments.forEach((typeArgument, index) => {
					const sourceTypeArgument = source.typeArguments[index];
					if (sourceTypeArgument != null) inferGenericParameters(typeArgument, sourceTypeArgument, substitutions, context, seen);
				});
			}
			return;
		case "UNION":
			inferFromUnion(pattern.types, source, substitutions, context, seen);
			return;
		case "INTERSECTION":
			pattern.types.forEach(child => inferGenericParameters(child, source, substitutions, context, seen));
			return;
		case "OBJECT":
		case "INTERFACE":
		case "CLASS": {
			const sourceObject = unwrapAlias(source);
			if (sourceObject.kind !== "OBJECT" && sourceObject.kind !== "INTERFACE" && sourceObject.kind !== "CLASS") return;
			if (pattern.call != null && containsGenericParameter(pattern.call)) {
				if (sourceObject.call != null) inferGenericParameters(pattern.call, sourceObject.call, substitutions, context, seen);
				return;
			}
			if (pattern.ctor != null && containsGenericParameter(pattern.ctor)) {
				if (sourceObject.ctor != null) inferGenericParameters(pattern.ctor, sourceObject.ctor, substitutions, context, seen);
				return;
			}
			for (const member of pattern.members || []) {
				if (!containsGenericParameter(member.type)) continue;
				const sourceMember = sourceObject.members?.find(candidate => candidate.name === member.name);
				if (sourceMember != null) inferGenericParameters(member.type, sourceMember.type, substitutions, context, seen);
			}
			if (pattern.indexType != null && sourceObject.indexType != null) {
				for (const key of ["STRING", "NUMBER"] as const) {
					const patternIndex = pattern.indexType[key];
					const sourceIndex = sourceObject.indexType[key];
					if (patternIndex != null && sourceIndex != null && containsGenericParameter(patternIndex)) {
						inferGenericParameters(patternIndex, sourceIndex, substitutions, context, seen);
					}
				}
			}
			return;
		}
		case "FUNCTION":
		case "METHOD": {
			const sourceFunction = unwrapAlias(source);
			if (sourceFunction.kind !== "FUNCTION" && sourceFunction.kind !== "METHOD") return;
			pattern.parameters?.forEach((parameter, index) => {
				const sourceParameter = sourceFunction.parameters?.[index];
				if (sourceParameter != null) inferGenericParameters(parameter.type, sourceParameter.type, substitutions, context, seen);
			});
			const patternReturnType = getDirectGenericReturnType(pattern);
			if (patternReturnType != null) {
				try {
					const sourceReturnType = sourceFunction.returnType;
					if (sourceReturnType != null) inferGenericParameters(patternReturnType, sourceReturnType, substitutions, context, seen);
				} catch {
					// An unsupported callback return type cannot contribute to inference.
				}
			}
			return;
		}
	}
}

function inferFromUnion(
	patternTypes: SimpleType[],
	source: SimpleType,
	substitutions: Map<string, SimpleType>,
	context: RuleModuleContext,
	seen: Map<SimpleType, Set<SimpleType>>
): void {
	const sourceTypes = source.kind === "UNION" ? source.types : [source];
	const genericBranches = patternTypes.filter(containsGenericParameter);

	for (const sourceType of sourceTypes) {
		if (sourceType.kind === "NULL" || sourceType.kind === "UNDEFINED") continue;
		for (const patternType of genericBranches) {
			inferGenericParameters(patternType, patternType.kind === "GENERIC_PARAMETER" ? source : sourceType, substitutions, context, seen);
		}
	}
}

function unwrapAlias(type: SimpleType): SimpleType {
	return type.kind === "ALIAS" ? type.target : type;
}

function getDirectGenericReturnType(type: SimpleType): SimpleType | undefined {
	try {
		const returnType = (type as SimpleType & { returnType?: SimpleType }).returnType;
		return returnType?.kind === "GENERIC_PARAMETER" ? returnType : undefined;
	} catch {
		return undefined;
	}
}

function removeNullableInference(type: SimpleType): SimpleType {
	if (type.kind !== "UNION") return type;
	const types = type.types.filter(child => child.kind !== "NULL" && child.kind !== "UNDEFINED");
	if (types.length === 0) return { kind: "UNKNOWN" };
	return types.length === 1 ? types[0] : { ...type, types };
}

function isUnusableInference(type: SimpleType): boolean {
	return type.kind === "ANY" || type.kind === "UNKNOWN" || type.kind === "NEVER";
}

function applyGenericConstraints(
	substitutions: Map<string, SimpleType>,
	parameters: Map<string, GenericParameterInfo>,
	context: RuleModuleContext
): void {
	for (const [name, info] of parameters) {
		const inferred = substitutions.get(name);
		if (inferred == null) continue;

		if (info.constraint != null && !isAssignableToType({ typeA: info.constraint, typeB: inferred }, context)) {
			// Keep the inferred parameter resolved, but use its constraint as the
			// target type. The original source value then fails against the
			// constrained member instead of silently passing as an arbitrary T.
			substitutions.set(name, info.constraint);
		}
	}
}

function substituteGenericParameters(
	type: SimpleType,
	substitutions: Map<string, SimpleType>,
	parameters: Map<string, GenericParameterInfo>,
	cache = new Map<SimpleType, SimpleType>(),
	relevance = new Map<SimpleType, boolean>()
): SimpleType {
	if (type.kind === "GENERIC_PARAMETER") {
		return parameters.get(type.name)?.type === type ? (substitutions.get(type.name) ?? parameters.get(type.name)?.defaultType ?? type) : type;
	}

	const cached = cache.get(type);
	if (cached != null) return cached;

	const containsComponentParameter = (child: SimpleType): boolean => {
		const cached = relevance.get(child);
		if (cached != null) return cached;
		let result = false;
		try {
			result = collectGenericParameterNames(child, new Set(), new Set(), new Set([...parameters.values()].map(parameter => parameter.type))).size > 0;
		} catch {
			// Unsupported library types cannot contribute a component parameter.
		}
		relevance.set(child, result);
		return result;
	};
	if (!containsComponentParameter(type)) {
		cache.set(type, type);
		return type;
	}

	// Install the result before descending so cycles and shared branches point
	// to the same substituted object, including after it has been completed.
	const placeholder = { ...type };
	cache.set(type, placeholder);

	let result: SimpleType;
	switch (type.kind) {
		case "ARRAY":
			result = containsComponentParameter(type.type)
				? { ...type, type: substituteGenericParameters(type.type, substitutions, parameters, cache, relevance) }
				: type;
			break;
		case "PROMISE":
			result = containsComponentParameter(type.type)
				? { ...type, type: substituteGenericParameters(type.type, substitutions, parameters, cache, relevance) }
				: type;
			break;
		case "UNION":
		case "INTERSECTION":
			result = {
				...type,
				types: type.types.map(child =>
					containsComponentParameter(child) ? substituteGenericParameters(child, substitutions, parameters, cache, relevance) : child
				)
			};
			break;
		case "ALIAS":
			result = containsComponentParameter(type.target)
				? { ...type, target: substituteGenericParameters(type.target, substitutions, parameters, cache, relevance) }
				: type;
			break;
		case "GENERIC_ARGUMENTS":
			result = {
				...type,
				target: type.target,
				typeArguments: type.typeArguments.map(child =>
					containsComponentParameter(child) ? substituteGenericParameters(child, substitutions, parameters, cache, relevance) : child
				)
			};
			break;
		case "TUPLE":
			result = {
				...type,
				members: type.members.map(member =>
					containsComponentParameter(member.type)
						? { ...member, type: substituteGenericParameters(member.type, substitutions, parameters, cache, relevance) }
						: member
				)
			};
			break;
		case "OBJECT":
		case "INTERFACE":
		case "CLASS": {
			const hasGenericCall = type.call != null && containsComponentParameter(type.call);
			const hasGenericCtor = type.ctor != null && containsComponentParameter(type.ctor);
			result = {
				...type,
				members:
					hasGenericCall || hasGenericCtor
						? type.members
						: type.members?.map(member =>
								containsComponentParameter(member.type)
									? { ...member, type: substituteGenericParameters(member.type, substitutions, parameters, cache, relevance) }
									: member
							),
				...(type.call == null || !hasGenericCall
					? {}
					: { call: substituteGenericParameters(type.call, substitutions, parameters, cache, relevance) as typeof type.call }),
				...(type.ctor == null || !hasGenericCtor
					? {}
					: { ctor: substituteGenericParameters(type.ctor, substitutions, parameters, cache, relevance) as typeof type.ctor }),
				...(type.indexType == null
					? {}
					: {
							indexType: Object.fromEntries(
								Object.entries(type.indexType).map(([key, child]) => [
									key,
									containsComponentParameter(child) ? substituteGenericParameters(child, substitutions, parameters, cache, relevance) : child
								])
							)
						})
			};
			break;
		}
		case "FUNCTION":
		case "METHOD":
			result = {
				...type,
				...(type.parameters == null
					? {}
					: {
							parameters: type.parameters.map(parameter =>
								containsComponentParameter(parameter.type)
									? { ...parameter, type: substituteGenericParameters(parameter.type, substitutions, parameters, cache, relevance) }
									: parameter
							)
						}),
				// A callback's return type is not part of generic inference here. In
				// particular, walking a DOM return type can encounter unrelated
				// generic library members and expand the entire DOM graph.
				...(type.returnType == null ? {} : { returnType: type.returnType })
			};
			break;
		default:
			result = type;
	}

	Object.assign(placeholder, result);
	return placeholder;
}

function inferSourceType(assignment: HtmlNodeAttrAssignment, checker: TypeChecker): SimpleType | Type {
	switch (assignment.kind) {
		case HtmlNodeAttrAssignmentKind.STRING:
			return { kind: "STRING_LITERAL", value: assignment.value };
		case HtmlNodeAttrAssignmentKind.BOOLEAN:
			return { kind: "BOOLEAN_LITERAL", value: true };
		case HtmlNodeAttrAssignmentKind.ELEMENT_EXPRESSION:
		case HtmlNodeAttrAssignmentKind.EXPRESSION:
			return checker.getTypeAtLocation(assignment.expression);
		case HtmlNodeAttrAssignmentKind.MIXED:
			if (assignment.htmlAttr.kind === HtmlNodeAttrKind.EVENT_LISTENER) {
				const expression = assignment.values.find((value): value is Expression => typeof value !== "string");
				if (expression != null) return checker.getTypeAtLocation(expression);
			}
			return { kind: "STRING" };
	}
}
