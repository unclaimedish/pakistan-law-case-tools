"use strict";

const $ = (selector) => document.querySelector(selector);
const elements = {
  copyAll: $("#copyAll"),
  copySelected: $("#copySelected"),
  count: $("#count"),
  entries: $("#entries"),
  export: $("#export"),
  openBulkCasePrintView: $("#openBulkCasePrintView"),
  openCasePrintView: $("#openCasePrintView"),
  bulkPrintStatus: $("#bulkPrintStatus"),
  selectAll: $("#selectAll"),
  selectionCount: $("#selectionCount"),
  toast: $("#toast"),
};

let citations = [];
let caseDocument = null;
let activeTabId = null;
let caseFrameId = null;
let loadedCaseCount = 0;
let exportFileName = "citations";
let hasCustomFileName = false;
let toastTimer;

function getBookmarkEntries() {
  const caseElement = document.querySelector("#searchtext");
  const caseText = caseElement?.innerText ?? caseElement?.textContent ?? "";
  const citations = [...document.querySelectorAll(".bookmark-text")]
    .map((bookmark) => {
      const cell = bookmark.closest("td");
      if (!cell) return null;

      const citation = cell.cloneNode(true);
      citation.querySelectorAll("b, .bookmark-text").forEach((element) => {
        element.remove();
      });
      const citationText = (citation.innerText ?? citation.textContent ?? "")
        .replace(/\s+/g, " ")
        .trim();
      const caseRow = bookmark.closest("tr")?.nextElementSibling;
      const caseName = (caseRow?.querySelector("td")?.innerText ?? "")
        .replace(/\s+/g, " ")
        .trim();
      const text = [citationText, caseName].filter(Boolean).join(" — ");
      return text ? { text, caseName } : null;
    })
    .filter((citation) => citation !== null);
  return {
    citations,
    caseCount: document.querySelectorAll(".caseDescription").length,
    caseDocument:
      caseElement && caseText.trim()
        ? {
            html: caseElement.outerHTML,
            title: caseElement.querySelector("title")?.textContent?.trim() || "Case",
          }
        : null,
    fileName: document.getElementById("bookSearch")?.value ?? "",
  };
}

async function collectCaseDocuments(limit) {
  const caseButtons = [...document.querySelectorAll(".caseDescription")].slice(0, limit);
  const contentElement = document.querySelector("#searchtext");
  const modalTitle = document.querySelector("#titleModalNewAppointment");
  const modal = document.querySelector("#ExceptionResponseScreen1");
  const bookmarkMessage = document.querySelector("#modalbookmarmessage");
  const searchInput = document.querySelector("#query");
  if (!caseButtons.length) {
    throw new Error("No loaded case descriptions were found");
  }
  if (!contentElement) {
    throw new Error("The case description panel is not available on this page");
  }

  const previousContent = contentElement.innerHTML;
  const previousTitle = modalTitle?.textContent ?? "";
  const previousModalCaseName = bookmarkMessage?.getAttribute("modalcasename");
  const previousSearchQuery = searchInput?.value;
  const wasModalOpen = modal?.classList.contains("in") ?? false;
  const documents = [];

  try {
    for (const [index, button] of caseButtons.entries()) {
      contentElement.replaceChildren();
      button.click();

      let previousHtml = "";
      let stableSince = Date.now();
      let caseHtml = "";
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        const html = contentElement.innerHTML.trim();
        const text = (contentElement.innerText ?? contentElement.textContent ?? "").trim();
        if (html !== previousHtml) {
          previousHtml = html;
          stableSince = Date.now();
        } else if (html && text.length > 80 && Date.now() - stableSince >= 300) {
          caseHtml = html;
          break;
        }
      }
      if (!caseHtml) {
        const caseName = button.getAttribute("casename") || `case ${index + 1}`;
        throw new Error(`Timed out while loading ${caseName}`);
      }

      const table = button.closest(".caseLawTable");
      const citationCell = table?.querySelector("tr:first-child td");
      const citation = citationCell?.cloneNode(true);
      citation?.querySelectorAll(".bookmark-text, button, input").forEach((element) => {
        element.remove();
      });
      const citationText = (citation?.innerText ?? citation?.textContent ?? "")
        .replace(/\s+/g, " ")
        .trim();
      const caseName = (table?.querySelector("tr:nth-child(2) td")?.innerText ?? "")
        .replace(/\s+/g, " ")
        .trim();
      documents.push({
        html: contentElement.outerHTML,
        title:
          [citationText, caseName].filter(Boolean).join(" — ") ||
          button.getAttribute("casename") ||
          `Case ${index + 1}`,
      });
    }
  } finally {
    if (!wasModalOpen) {
      document.querySelector("#TopCloseButtonCreate")?.click();
    }
    contentElement.innerHTML = previousContent;
    if (modalTitle) modalTitle.textContent = previousTitle;
    if (bookmarkMessage) {
      if (previousModalCaseName === null || previousModalCaseName === undefined) {
        bookmarkMessage.removeAttribute("modalcasename");
      } else {
        bookmarkMessage.setAttribute("modalcasename", previousModalCaseName);
      }
    }
    if (searchInput && previousSearchQuery !== undefined) {
      searchInput.value = previousSearchQuery;
    }
  }

  return documents;
}

function safeFileName(value) {
  const name = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/[. ]+$/, "")
    .trim()
    .replace(/\.txt$/i, "");
  return name && name !== "." && name !== ".." ? name : "citations";
}

function showToast(message, isError = false) {
  elements.toast.textContent = message;
  elements.toast.classList.toggle("error", isError);
  elements.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 2200);
}

async function copyText(text, successMessage) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        showToast(successMessage);
        return;
      } catch (error) {
        console.warn("Clipboard API failed; trying the document copy fallback:", error);
      }
    }

    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    let copied;
    try {
      field.select();
      copied = document.execCommand("copy");
    } finally {
      field.remove();
    }
    if (!copied) throw new Error("Clipboard copy was denied");
    showToast(successMessage);
  } catch (error) {
    console.error("Bookmark Text could not copy to the clipboard:", error);
    showToast("Couldn't copy. Check clipboard permissions and try again.", true);
  }
}

function selectedCitations() {
  return citations.filter((citation) => citation.selected).map(({ text }) => text);
}

function updateControls() {
  const selected = citations.filter((citation) => citation.selected).length;
  const hasCitations = citations.length > 0;
  elements.selectAll.disabled = !hasCitations;
  elements.selectAll.checked = hasCitations && selected === citations.length;
  elements.selectAll.indeterminate = selected > 0 && selected < citations.length;
  elements.copyAll.disabled = !hasCitations;
  elements.copySelected.disabled = selected === 0;
  elements.export.disabled = selected === 0;
  elements.export.textContent = selected ? `Export .txt (${selected})` : "Export .txt";
  elements.selectionCount.textContent = hasCitations
    ? `${selected} of ${citations.length} selected`
    : "";
}

function renderCitations() {
  elements.entries.replaceChildren();
  elements.count.textContent = `${citations.length} citation${citations.length === 1 ? "" : "s"} found`;

  if (!citations.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No bookmark entries found on this page.";
    elements.entries.appendChild(empty);
    updateControls();
    return;
  }

  citations.forEach((citation, index) => {
    const item = document.createElement("li");
    item.className = "entry";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = citation.selected;
    checkbox.setAttribute("aria-label", `Select citation ${index + 1}`);
    checkbox.addEventListener("change", () => {
      citation.selected = checkbox.checked;
      updateControls();
    });

    const value = document.createElement("button");
    value.className = "entry-value";
    value.type = "button";
    value.textContent = citation.text;
    value.title = "Click to copy this citation";
    value.addEventListener("click", () => copyText(citation.text, "Copied citation"));

    item.append(checkbox, value);
    elements.entries.appendChild(item);
  });
  updateControls();
}

function exportSelected() {
  const selected = selectedCitations();
  if (!selected.length) return;

  let fileName = exportFileName;
  if (!hasCustomFileName && selected.length === 1) {
    const caseName = citations.find(({ selected: isSelected }) => isSelected)?.caseName;
    if (caseName) fileName = `citations - ${caseName}`;
  }

  try {
    const file = new Blob([`${selected.join("\n")}\n`], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeFileName(fileName)}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`Exported ${selected.length} citation${selected.length === 1 ? "" : "s"}`);
  } catch (error) {
    console.error("Bookmark Text could not export citations:", error);
    showToast("Couldn't export citations. Try again.", true);
  }
}

async function openCasePrintView() {
  if (!caseDocument) return;

  try {
    await openPrintView(caseDocument, "case-print");
  } catch (error) {
    console.error("Bookmark Text could not open the case print view:", error);
    showToast("Couldn't open the case print view. Try again.", true);
  }
}

async function openPrintView(printData, keyPrefix) {
  const storageKey = `${keyPrefix}-${crypto.randomUUID()}`;
  await chrome.storage.session.set({ [storageKey]: printData });
  try {
    await chrome.tabs.create({
      url: `${chrome.runtime.getURL("print.html")}#${encodeURIComponent(storageKey)}`,
    });
  } catch (error) {
    try {
      await chrome.storage.session.remove(storageKey);
    } catch (cleanupError) {
      console.error("Bookmark Text could not clear temporary case data:", cleanupError);
    }
    throw error;
  }
}

async function openBulkCasePrintView() {
  if (typeof activeTabId !== "number" || typeof caseFrameId !== "number") return;

  const caseLimit = Math.min(50, loadedCaseCount);
  elements.openBulkCasePrintView.disabled = true;
  elements.bulkPrintStatus.textContent = `Loading up to ${caseLimit} case descriptions…`;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: activeTabId, frameIds: [caseFrameId] },
      func: collectCaseDocuments,
      args: [caseLimit],
    });
    const documents = results[0]?.result;
    if (!Array.isArray(documents) || documents.length !== caseLimit) {
      throw new Error("The page did not return all requested case descriptions");
    }

    await openPrintView(
      {
        title: `${documents.length} Cases`,
        cases: documents,
      },
      "bulk-case-print",
    );
    elements.bulkPrintStatus.textContent =
      `Ready: ${documents.length} cases. Use Print / Save as PDF to create one PDF.`;
  } catch (error) {
    console.error("Bookmark Text could not prepare the bulk case print view:", error);
    elements.bulkPrintStatus.textContent =
      "Couldn't load all case descriptions. Check the page and try again.";
    showToast("Couldn't load all case descriptions. Try again.", true);
  } finally {
    elements.openBulkCasePrintView.disabled = loadedCaseCount === 0;
    elements.openBulkCasePrintView.textContent =
      `Open up to ${Math.min(50, loadedCaseCount)} cases in print view`;
  }
}

async function scanPage() {
  elements.count.textContent = "Scanning this page…";
  elements.entries.setAttribute("aria-busy", "true");

  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (typeof tab?.id !== "number") {
      throw new Error("No active browser tab is available");
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: getBookmarkEntries,
    });
    const pageData = results.map((frame) => frame.result).filter(Boolean);
    const caseFrame = results.find((frame) => frame.result?.caseCount > 0);
    activeTabId = tab.id;
    caseFrameId = caseFrame?.frameId ?? null;
    loadedCaseCount = caseFrame?.result?.caseCount ?? 0;
    citations = pageData.flatMap(({ citations: frameCitations }) =>
      frameCitations.map(({ text, caseName }) => ({
        text,
        caseName,
        selected: true,
      })),
    );
    caseDocument =
      pageData.find(({ caseDocument: frameCase }) => frameCase?.html)?.caseDocument ?? null;
    elements.openCasePrintView.disabled = !caseDocument;
    elements.openBulkCasePrintView.disabled = loadedCaseCount === 0;
    elements.openBulkCasePrintView.textContent =
      `Open up to ${Math.min(50, loadedCaseCount)} cases in print view`;
    const searchValue = pageData.find(({ fileName }) => fileName.trim())?.fileName;
    hasCustomFileName = Boolean(searchValue);
    exportFileName = hasCustomFileName ? safeFileName(searchValue) : "citations";
    renderCitations();
  } catch (error) {
    console.error("Bookmark Text could not scan this page:", error);
    citations = [];
    caseDocument = null;
    activeTabId = null;
    caseFrameId = null;
    loadedCaseCount = 0;
    elements.openCasePrintView.disabled = true;
    elements.openBulkCasePrintView.disabled = true;
    elements.count.textContent = "Page unavailable";
    elements.entries.replaceChildren();
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Can't read this page. Try a regular website.";
    elements.entries.appendChild(empty);
    updateControls();
  } finally {
    elements.entries.setAttribute("aria-busy", "false");
  }
}

elements.selectAll.addEventListener("change", () => {
  citations.forEach((citation) => {
    citation.selected = elements.selectAll.checked;
  });
  renderCitations();
});
elements.copyAll.addEventListener("click", () => {
  if (citations.length) {
    copyText(
      citations.map(({ text }) => text).join("\n"),
      `Copied all ${citations.length} citations`,
    );
  }
});
elements.copySelected.addEventListener("click", () => {
  const selected = selectedCitations();
  if (selected.length) {
    copyText(
      selected.join("\n"),
      `Copied ${selected.length} selected citation${selected.length === 1 ? "" : "s"}`,
    );
  }
});
elements.export.addEventListener("click", exportSelected);
elements.openCasePrintView.addEventListener("click", openCasePrintView);
elements.openBulkCasePrintView.addEventListener("click", openBulkCasePrintView);

scanPage();
