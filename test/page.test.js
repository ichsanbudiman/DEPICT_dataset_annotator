import { test } from "node:test";
import assert from "node:assert/strict";
import { deskPage, deskScript } from "../server/page.js";

test("the page includes each view and the script still parses", () => {
  const html = deskPage();
  for (const id of ["view-ann", "view-rev", "view-ppl", "view-cor"]) {
    assert.equal(html.includes(`id="${id}"`), true, id);
  }
  assert.equal(html.includes("<!--views-->"), false);
  const js = deskScript();
  assert.equal(js.includes("function renderSubject"), true);
  assert.equal(js.includes("function renderReview"), true);
  assert.equal(js.includes("function renderPeople"), true);
  assert.equal(js.includes("Pruned graph"), true);
  assert.equal(html.includes('id="kappa-help-dlg"'), true);
  assert.equal(js.includes("function openKappaHelp"), true);
  assert.equal(html.includes('id="set-help-dlg"'), true);
  assert.equal(js.includes("function openSetHelp"), true);
  new Function(js);
});
