"use strict";

const titleElement = document.querySelector("#printTitle");
const statusElement = document.querySelector("#printStatus");
const contentElement = document.querySelector("#caseContent");
const printButton = document.querySelector("#printButton");

function sanitizeCaseElement(element) {
  const elements = [element, ...element.querySelectorAll("*")];
  elements.forEach((node) => {
    [...node.attributes].forEach((attribute) => {
      if (
        attribute.name.toLowerCase().startsWith("on") ||
        (["href", "src", "xlink:href"].includes(attribute.name.toLowerCase()) &&
          /^\s*javascript:/i.test(attribute.value))
      ) {
        node.removeAttribute(attribute.name);
      }
    });
  });

  element
    .querySelectorAll("script, iframe, object, embed, form, button, input, textarea, select")
    .forEach((node) => node.remove());
}

function renderCaseDocument(caseDocument) {
  if (
    !caseDocument ||
    typeof caseDocument.html !== "string" ||
    typeof caseDocument.title !== "string"
  ) {
    throw new Error("The case content is missing or invalid");
  }

  const parsedDocument = new DOMParser().parseFromString(caseDocument.html, "text/html");
  const caseElement = parsedDocument.querySelector("#searchtext");
  if (!caseElement) {
    throw new Error("The case content could not be found in the print data");
  }

  parsedDocument.querySelectorAll("style").forEach((style) => {
    document.head.appendChild(document.importNode(style, true));
  });
  parsedDocument.querySelectorAll("style, link, meta, title, base").forEach((node) => {
    node.remove();
  });
  sanitizeCaseElement(caseElement);
  contentElement.replaceChildren(document.importNode(caseElement, true));

  const title = caseDocument.title.trim() || "Case";
  document.title = title;
  titleElement.textContent = title;
  printButton.disabled = false;
  statusElement.textContent = "Use Ctrl+P or the button to print or save as PDF.";
}

async function loadCaseDocument() {
  const storageKey = decodeURIComponent(window.location.hash.slice(1));
  if (!storageKey) {
    throw new Error("No case content was provided");
  }

  const stored = await chrome.storage.session.get(storageKey);
  const caseDocument = stored[storageKey];
  renderCaseDocument(caseDocument);

  try {
    await chrome.storage.session.remove(storageKey);
  } catch (error) {
    console.error("Bookmark Text could not clear temporary case data:", error);
    statusElement.textContent =
      "Print view is ready, but temporary case data could not be cleared.";
  }
}

printButton.addEventListener("click", () => window.print());

loadCaseDocument().catch((error) => {
  console.error("Bookmark Text could not load the case print view:", error);
  statusElement.textContent = "Couldn't load the case content. Reopen it from the extension.";
});
