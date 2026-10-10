"use strict";

const $ = (selector) => document.querySelector(selector);
const elements = {
  copyAll: $("#copyAll"),
  copySelected: $("#copySelected"),
  count: $("#count"),
  entries: $("#entries"),
  export: $("#export"),
  selectAll: $("#selectAll"),
  selectionCount: $("#selectionCount"),
  toast: $("#toast"),
};

let citations = [];
let exportFileName = "citations";
let hasCustomFileName = false;
let toastTimer;

function getBookmarkEntries() {
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
    fileName: document.getElementById("bookSearch")?.value ?? "",
  };
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
    citations = pageData.flatMap(({ citations: frameCitations }) =>
      frameCitations.map(({ text, caseName }) => ({
        text,
        caseName,
        selected: true,
      })),
    );
    const searchValue = pageData.find(({ fileName }) => fileName.trim())?.fileName;
    hasCustomFileName = Boolean(searchValue);
    exportFileName = hasCustomFileName ? safeFileName(searchValue) : "citations";
    renderCitations();
  } catch (error) {
    console.error("Bookmark Text could not scan this page:", error);
    citations = [];
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

scanPage();
