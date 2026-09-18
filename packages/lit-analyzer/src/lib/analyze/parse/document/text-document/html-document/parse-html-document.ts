import type { Expression, TaggedTemplateExpression } from "typescript";
import { tsModule } from "../../../../ts-module.js";
import type { DocumentRange } from "../../../../types/range.js";
import { VirtualAstHtmlDocument } from "../../virtual-document/virtual-html-document.js";
import { HtmlDocument } from "./html-document.js";
import type { ParseHtmlContext } from "./parse-html-node/parse-html-context.js";
import { parseHtmlNodes } from "./parse-html-node/parse-html-node.js";
import { parseHtml } from "./parse-html-p5/parse-html.js";

export function parseHtmlDocuments(nodes: TaggedTemplateExpression[]): HtmlDocument[] {
	return nodes.map(parseHtmlDocument);
}

export function parseHtmlDocument(node: TaggedTemplateExpression): HtmlDocument {
	const virtualDocument = new VirtualAstHtmlDocument(node);
	const html = virtualDocument.text;
	const htmlAst = parseHtml(html);
	const document = new HtmlDocument(virtualDocument, []);

	const context: ParseHtmlContext = {
		html,
		document,
		// Compatibility recovery for malformed clone templates passed directly to
		// createElement(...). Recovering a matching explicit end tag avoids cascading
		// parser diagnostics; it does not make the missing opening-tag ">" valid HTML.
		// Qualified/aliased calls and parenthesized arguments retain normal parsing.
		recoverExplicitlyClosedCustomElement: isCreateElementHtmlTemplate(node),
		getPartsAtOffsetRange(range: DocumentRange): (Expression | string)[] {
			return virtualDocument.getPartsAtDocumentRange(range);
		}
	};

	document.rootNodes = parseHtmlNodes(htmlAst.childNodes, undefined, context);

	return document;
}

function isCreateElementHtmlTemplate(node: TaggedTemplateExpression): boolean {
	const parent = node.parent;
	return tsModule.ts.isCallExpression(parent) && parent.expression.getText() === "createElement";
}
