import { TS_IGNORE_FLAG } from "../../../../../constants.js";
import type { HtmlNode, IHtmlNodeBase, IHtmlNodeSourceCodeLocation } from "../../../../../types/html-node/html-node-types.js";
import { HtmlNodeKind } from "../../../../../types/html-node/html-node-types.js";
import type { Range } from "../../../../../types/range.js";
import { isCustomElementTagName } from "../../../../../util/is-valid-name.js";
import { isCommentNode, isTagNode } from "../parse-html-p5/parse-html.js";
import type { DefaultTreeAdapterTypes } from "parse5";
import { parseHtmlNodeAttrs } from "./parse-html-attribute.js";
import type { ParseHtmlContext } from "./parse-html-context.js";

/**
 * Parses multiple p5Nodes into multiple html nodes.
 * @param p5Nodes
 * @param parent
 * @param context
 */
export function parseHtmlNodes(p5Nodes: DefaultTreeAdapterTypes.Node[], parent: HtmlNode | undefined, context: ParseHtmlContext): HtmlNode[] {
	const htmlNodes: HtmlNode[] = [];
	let ignoreNextNode = false;
	for (const p5Node of p5Nodes) {
		// Check ts-ignore comments and indicate that we wan't to ignore the next node
		if (isCommentNode(p5Node)) {
			if (p5Node.data != null && p5Node.data.includes(TS_IGNORE_FLAG)) {
				ignoreNextNode = true;
			}
		}

		if (isTagNode(p5Node)) {
			if (!ignoreNextNode) {
				const htmlNode = parseHtmlNode(p5Node, parent, context);

				if (htmlNode != null) {
					htmlNodes.push(htmlNode);
				}
			} else {
				ignoreNextNode = false;
			}
		}
	}
	return htmlNodes;
}

/**
 * Parses a single p5Node into a html node.
 * @param p5Node
 * @param parent
 * @param context
 */
export function parseHtmlNode(
	p5Node: DefaultTreeAdapterTypes.Element,
	parent: HtmlNode | undefined,
	context: ParseHtmlContext
): HtmlNode | undefined {
	// `sourceCodeLocation` will be undefined if the element was implicitly created by the parser.
	if (p5Node.sourceCodeLocation == null) return undefined;

	const recoveredEndTag = getRecoveredEndTag(p5Node, context);
	const htmlNodeBase: IHtmlNodeBase = {
		tagName: p5Node.tagName.toLowerCase(),
		attributes: [],
		location: makeHtmlNodeLocation(p5Node, recoveredEndTag),
		children: [],
		document: context.document,
		parent
	};

	const htmlNode = parseHtmlNodeBase(htmlNodeBase);

	// Don't parse children of <style> and <svg> as of now
	if (htmlNode.kind === HtmlNodeKind.NODE) {
		htmlNode.children = parseHtmlNodes(p5Node.childNodes || [], htmlNode, context);
	}

	const attrs =
		recoveredEndTag == null
			? p5Node.attrs
			: p5Node.attrs.filter(attr => {
					const location = p5Node.sourceCodeLocation?.attrs?.[attr.name];
					// parse5 keeps the first occurrence of a duplicate attribute name.
					// Preserve real attributes that precede the recovered closing tag.
					return location == null || location.startOffset < recoveredEndTag.start || location.endOffset > recoveredEndTag.end;
				});
	htmlNode.attributes = parseHtmlNodeAttrs({ ...p5Node, attrs }, { ...context, htmlNode });

	return htmlNode;
}

/**
 * Creates source code location from a p5Node.
 * @param p5Node
 * @param recoveredEndTag
 */
function makeHtmlNodeLocation(p5Node: DefaultTreeAdapterTypes.Element, recoveredEndTag?: Range): IHtmlNodeSourceCodeLocation {
	const loc = p5Node.sourceCodeLocation!;

	return {
		start: loc.startOffset,
		end: loc.endOffset,
		name: {
			start: loc.startTag!.startOffset + 1, // take '<' into account
			end: loc.startTag!.startOffset + 1 + p5Node.tagName.length
		},
		startTag: {
			start: loc.startTag!.startOffset,
			end: recoveredEndTag?.start ?? loc.startTag!.endOffset
		},
		endTag:
			recoveredEndTag ??
			(loc.endTag == null
				? undefined
				: {
						start: loc.endTag.startOffset,
						end: loc.endTag.endOffset
					})
	};
}

function getRecoveredEndTag(p5Node: DefaultTreeAdapterTypes.Element, context: ParseHtmlContext): Range | undefined {
	if (!context.recoverExplicitlyClosedCustomElement || !isCustomElementTagName(p5Node.tagName)) {
		return undefined;
	}

	const loc = p5Node.sourceCodeLocation;
	const closingTagStart = loc?.attrs?.["<"];
	if (loc == null || closingTagStart == null || loc.endTag != null) {
		return undefined;
	}

	const closingTagEndOffset = context.html.indexOf(">", closingTagStart.startOffset) + 1;
	if (closingTagEndOffset <= closingTagStart.startOffset) {
		return undefined;
	}

	const closingTagText = context.html.slice(closingTagStart.startOffset, closingTagEndOffset);
	const closingTagMatch = closingTagText.match(/^<\/([^\t\n\f\r />]+)[\t\n\f\r ]*>$/);
	if (closingTagMatch == null || closingTagMatch[1].toLowerCase() !== p5Node.tagName.toLowerCase()) {
		return undefined;
	}

	return {
		start: closingTagStart.startOffset,
		end: closingTagEndOffset
	};
}

function parseHtmlNodeBase(htmlNodeBase: IHtmlNodeBase): HtmlNode {
	if (htmlNodeBase.tagName === "style") {
		return {
			kind: HtmlNodeKind.STYLE,
			...htmlNodeBase,
			children: []
		};
	} else if (htmlNodeBase.tagName === "svg") {
		// Ignore children of "svg" for now
		return {
			kind: HtmlNodeKind.SVG,
			...htmlNodeBase,
			children: []
		};
	}

	return {
		kind: HtmlNodeKind.NODE,
		...htmlNodeBase
	};

	/*if (component != null) {
	 return {
	 ...htmlNodeBase,
	 kind: HtmlNodeKind.COMPONENT,
	 component
	 };
	 }

	 if (isBuiltInTag(htmlNodeBase.tagName)) {
	 // For now: opt out of svg and style children tags
	 // TODO: Handle svg and style tags
	 const isBlacklisted = ["svg", "style"].includes(htmlNodeBase.tagName);

	 return {
	 ...htmlNodeBase,
	 kind: HtmlNodeKind.BUILT_IN,
	 children: isBlacklisted ? [] : htmlNodeBase.children
	 };
	 }*/

	/*return {
	 kind: HtmlNodeKind.UNKNOWN,
	 ...htmlNodeBase
	 };*/
}
