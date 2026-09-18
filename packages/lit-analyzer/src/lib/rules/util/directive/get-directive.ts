import type { SimpleType } from "ts-simple-type";
import { toSimpleType } from "ts-simple-type";
import type { Expression } from "typescript";
import type { HtmlNodeAttrAssignment } from "../../../analyze/types/html-node/html-node-attr-assignment-types.js";
import { HtmlNodeAttrAssignmentKind } from "../../../analyze/types/html-node/html-node-attr-assignment-types.js";
import { HtmlNodeAttrKind } from "../../../analyze/types/html-node/html-node-attr-types.js";
import type { RuleModuleContext } from "../../../analyze/types/rule/rule-module-context.js";
import { lazy } from "../../../analyze/util/general-util.js";
import { removeUndefinedFromType } from "../type/remove-undefined-from-type.js";
import { isLit1Directive, isLitDirective } from "./is-lit-directive.js";

export type BuiltInDirectiveKind =
	| "ifDefined"
	| "guard"
	| "classMap"
	| "styleMap"
	| "unsafeHTML"
	| "cache"
	| "repeat"
	| "live"
	| "templateContent"
	| "unsafeSVG"
	| "asyncReplace"
	| "asyncAppend"
	| "nothing";

export interface UserDefinedDirectiveKind {
	name: string;
}

interface Directive {
	kind: BuiltInDirectiveKind | UserDefinedDirectiveKind;
	actualType?: () => SimpleType | undefined;
	args: Expression[];
}

export function getDirective(assignment: HtmlNodeAttrAssignment, context: RuleModuleContext): Directive | undefined {
	const { ts, program } = context;
	const checker = program.getTypeChecker();

	if (assignment.kind !== HtmlNodeAttrAssignmentKind.EXPRESSION) return;

	// Lit's `nothing` sentinel removes the current part. It is a unique symbol,
	// rather than a callable directive, so recognize the named sentinel before
	// looking for directive calls. Event listeners have a different runtime
	// contract and must continue to validate callable values normally.
	if (assignment.htmlAttr.kind !== HtmlNodeAttrKind.EVENT_LISTENER) {
		const expressionType = toSimpleType(checker.getTypeAtLocation(assignment.expression), checker);

		if (isNothingType(expressionType)) {
			return {
				kind: "nothing",
				actualType: () => ({ kind: "ANY" }),
				args: []
			};
		}

		if (containsNothingType(expressionType)) {
			return {
				kind: "nothing",
				actualType: () => removeNothingFromType(expressionType),
				args: []
			};
		}
	}

	// Type check lit-html directives
	if (ts.isCallExpression(assignment.expression)) {
		const functionName = assignment.expression.expression.getText() as BuiltInDirectiveKind | string;
		const args = Array.from(assignment.expression.arguments);

		switch (functionName) {
			case "ifDefined": {
				// Example: html`<img src="${ifDefined(imageUrl)}">`;
				// Take the argument to ifDefined and remove undefined from the type union (if possible).
				// This new type becomes the actual type of the expression
				const actualType = lazy(() => {
					if (args.length >= 1) {
						const exprType = toSimpleType(checker.getTypeAtLocation(assignment.expression), checker);

						if (isLit1Directive(exprType)) {
							const returnType = toSimpleType(checker.getTypeAtLocation(args[0]), checker);
							return removeUndefinedFromType(returnType);
						}

						return toSimpleType(checker.getNonNullableType(checker.getTypeAtLocation(args[0])), checker);
					}

					return undefined;
				});

				return {
					kind: "ifDefined",
					actualType,
					args
				};
			}

			case "live": {
				// Example: html`<input .value=${live(x)}>`
				// The actual type will be the type of the first argument to live
				const actualType = lazy(() => {
					if (args.length >= 1) {
						return toSimpleType(checker.getTypeAtLocation(args[0]), checker);
					}

					return undefined;
				});

				return {
					kind: "live",
					actualType,
					args
				};
			}

			case "guard": {
				// Example: html`<img src="${guard([imageUrl], () => Math.random() > 0.5 ? imageUrl : "nothing.png")}>`;
				// The return type of the function becomes the actual type of the expression
				const actualType = lazy(() => {
					if (args.length >= 2) {
						let returnFunctionType = toSimpleType(checker.getTypeAtLocation(args[1]), checker);
						if ("call" in returnFunctionType && returnFunctionType.call != null) {
							returnFunctionType = returnFunctionType.call;
						}

						if (returnFunctionType.kind === "FUNCTION") {
							return returnFunctionType.returnType;
						}
					}

					return undefined;
				});

				return {
					kind: "guard",
					actualType,
					args
				};
			}

			case "classMap":
			case "styleMap":
				return {
					kind: functionName,
					actualType: () => ({ kind: "STRING" }),
					args
				};

			case "unsafeHTML":
			case "unsafeSVG":
			case "cache":
			case "repeat":
			case "templateContent":
			case "asyncReplace":
			case "asyncAppend":
				return {
					kind: functionName,
					args
				};

			default:
				// Grab the type of the expression and get a SimpleType
				if (assignment.kind === HtmlNodeAttrAssignmentKind.EXPRESSION) {
					const typeB = toSimpleType(checker.getTypeAtLocation(assignment.expression), checker);

					if (isLitDirective(typeB)) {
						// Factories can mark which parameters might be assigned to the property with the generic type in DirectiveFn<T>
						// Here we get the actual type of the directive if the it is a generic directive with type. Example: DirectiveFn<string>
						// Read more: https://github.com/Polymer/lit-html/pull/1151
						const actualType =
							typeB.kind === "GENERIC_ARGUMENTS" && typeB.target.name === "DirectiveFn" && typeB.typeArguments.length > 0 // && typeB.typeArguments[0].kind !== "UNKNOWN"
								? () => typeB.typeArguments[0]
								: undefined;

						// Now we have an unknown (user defined) directive.
						return {
							kind: {
								name: functionName
							},
							args,
							actualType
						};
					}
				}
		}
	}

	return;
}

function isNothingType(type: SimpleType): boolean {
	switch (type.kind) {
		case "ES_SYMBOL_UNIQUE":
			return type.value.includes("@nothing@");
		case "ALIAS":
			return isNothingType(type.target);
		default:
			return false;
	}
}

function containsNothingType(type: SimpleType): boolean {
	if (isNothingType(type)) return true;

	switch (type.kind) {
		case "ALIAS":
			return containsNothingType(type.target);
		case "UNION":
			return type.types.some(containsNothingType);
		default:
			return false;
	}
}

function removeNothingFromType(type: SimpleType): SimpleType {
	switch (type.kind) {
		case "ALIAS":
			return {
				...type,
				target: removeNothingFromType(type.target)
			};
		case "UNION": {
			const types = type.types.filter(typePart => !isNothingType(typePart)).map(removeNothingFromType);
			return types.length === 1 ? types[0] : { ...type, types };
		}
		default:
			return type;
	}
}
