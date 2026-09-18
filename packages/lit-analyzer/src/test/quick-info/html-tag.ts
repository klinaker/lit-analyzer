import test from "ava";
import type { SimpleType } from "ts-simple-type";
import { targetKindAndTypeText } from "../../lib/analyze/parse/parse-html-data/html-tag.js";
import type { HtmlAttr } from "../../lib/analyze/parse/parse-html-data/html-tag.js";

function makeAnyAttribute(typeHint?: string): HtmlAttr {
	return {
		kind: "attribute",
		name: "value",
		getType: () => ({ kind: "ANY" }) as SimpleType,
		declaration: typeHint == null ? undefined : ({ typeHint } as HtmlAttr["declaration"])
	};
}

test("Render type hints for any HTML targets", t => {
	t.is(targetKindAndTypeText(makeAnyAttribute("string")), "(attribute) value: string");
});

test("Omit type hints when any HTML targets have no declaration hint", t => {
	t.is(targetKindAndTypeText(makeAnyAttribute()), "(attribute) value");
});
